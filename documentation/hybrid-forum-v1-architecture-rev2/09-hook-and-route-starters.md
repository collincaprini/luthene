# Hook and Route Starters

This file is intentionally practical.

The snippets are **pseudocode / starter structure**, not drop-in production code.
Use them to keep the implementation shape straight.

## 1. `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/internal/cron/moderation",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/internal/cron/debates",
      "schedule": "* * * * *"
    }
  ]
}
```

## 2. PocketBase hook outline for moderated collections

Suggested targets:

- `posts`
- `post_comments`
- `debate_comments`

### Goal

- force normal-user writes into `pending`
- bump revision
- enqueue moderation work after successful persistence

### Pseudocode

```js
function normalizeModeratedRecord(e) {
  const auth = e.requestInfo.auth;

  // internal superuser paths may bypass this normalization
  if (auth && auth.isSuperuser && auth.isSuperuser()) {
    return e.next();
  }

  const now = new Date().toISOString();

  // Starter idea only: derive current revision from existing record state
  const oldRevision = e.record.getInt("contentRevision") || 0;
  const nextRevision = oldRevision + 1;

  e.record.set("moderationStatus", "pending");
  e.record.set("contentRevision", nextRevision);
  e.record.set("moderationRequestedAt", now);
  e.record.set("moderationCompletedAt", "");
  e.record.set("lastUserEditAt", now);

  return e.next();
}

onRecordCreateRequest((e) => normalizeModeratedRecord(e), "posts", "post_comments", "debate_comments");
onRecordUpdateRequest((e) => normalizeModeratedRecord(e), "posts", "post_comments", "debate_comments");

function enqueueModerationJob(e, collectionName) {
  const record = e.record;

  const job = new Record($app.findCollectionByNameOrId("moderation_jobs"));
  job.set("collectionName", collectionName);
  job.set("recordId", record.id);
  job.set("recordRevision", record.getInt("contentRevision"));
  job.set("jobStatus", "queued");
  job.set("priority", 100);
  job.set("attemptCount", 0);
  job.set("nextAttemptAt", new Date().toISOString());
  job.set("createdByUserId", record.get("authorId") || "");
  $app.save(job);
  return e.next();
}

onRecordAfterCreateSuccess((e) => enqueueModerationJob(e, "posts"), "posts");
onRecordAfterUpdateSuccess((e) => enqueueModerationJob(e, "posts"), "posts");

onRecordAfterCreateSuccess((e) => enqueueModerationJob(e, "post_comments"), "post_comments");
onRecordAfterUpdateSuccess((e) => enqueueModerationJob(e, "post_comments"), "post_comments");

onRecordAfterCreateSuccess((e) => enqueueModerationJob(e, "debate_comments"), "debate_comments");
onRecordAfterUpdateSuccess((e) => enqueueModerationJob(e, "debate_comments"), "debate_comments");
```

### Notes

- keep the hook cheap
- do not call the moderation provider from the request hook in v1
- use the hook only to normalize and enqueue

## 3. Secure cron handler skeleton

```ts
import { NextRequest } from "next/server";

function assertCronAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new Error("Unauthorized");
  }
}
```

## 4. Moderation cron handler skeleton

```ts
export async function GET(req: NextRequest) {
  assertCronAuth(req);

  const run = await startCronRun("moderation");

  try {
    const jobs = await claimModerationJobs({ limit: 20 });

    for (const job of jobs) {
      const record = await loadTargetRecord(job.collectionName, job.recordId);

      if (!record) {
        await finalizeJob(job, "stale", "missing record");
        continue;
      }

      if (record.lifecycleStatus === "deleted") {
        await finalizeJob(job, "stale", "deleted record");
        continue;
      }

      if (record.contentRevision !== job.recordRevision) {
        await finalizeJob(job, "stale", "revision mismatch");
        continue;
      }

      const moderation = await moderateOrdinaryContent(record);

      if (moderation.decision === "approved") {
        await approveOrdinaryRecord(record, moderation);
        await finalizeJob(job, "approved");
      } else if (moderation.decision === "rejected") {
        await rejectOrdinaryRecord(record, moderation);
        await finalizeJob(job, "rejected");
      } else {
        await markOrdinaryRecordNeedsReview(record, moderation);
        await finalizeJob(job, "needs_review");
      }
    }

    await finishCronRun(run, "completed");
    return Response.json({ ok: true });
  } catch (err) {
    await finishCronRun(run, "failed", err);
    return new Response("error", { status: 500 });
  }
}
```

## 5. Debate cron handler skeleton

```ts
export async function GET(req: NextRequest) {
  assertCronAuth(req);

  const run = await startCronRun("debates");

  try {
    const debates = await findDueDebates({ limit: 20 });

    for (const debate of debates) {
      const lock = await tryAcquireDebateLock({
        debateId: debate.id,
        ownerType: "cron",
        ownerId: run.id,
        ttlSeconds: 45,
      });

      if (!lock) continue;

      try {
        const fresh = await loadDebateState(debate.id);

        if (fresh.status === "pending_acceptance" && isPast(fresh.acceptanceDeadlineAt)) {
          await cancelForAcceptanceTimeout(fresh);
          continue;
        }

        const activeRound = fresh.activeRound;

        if (!activeRound) continue;

        if (
          (activeRound.status === "awaiting_opener" || activeRound.status === "awaiting_response") &&
          isPast(activeRound.turnDeadlineAt)
        ) {
          await forfeitMissedTurn(fresh, activeRound);
          continue;
        }

        if (activeRound.status === "voting" && isPast(activeRound.votingEndsAt)) {
          await closeVotingRound(fresh, activeRound);
          continue;
        }
      } finally {
        await releaseDebateLock(lock.id);
      }
    }

    await finishCronRun(run, "completed");
    return Response.json({ ok: true });
  } catch (err) {
    await finishCronRun(run, "failed", err);
    return new Response("error", { status: 500 });
  }
}
```

## 6. Submit-turn route skeleton

```ts
export async function POST(req: NextRequest, ctx: { params: Promise<{ debateId: string }> }) {
  const { debateId } = await ctx.params;
  const user = await requirePocketBaseAuth(req);
  const payload = await req.formData();

  const lock = await tryAcquireDebateLock({
    debateId,
    ownerType: "submit_turn",
    ownerId: crypto.randomUUID(),
    ttlSeconds: 45,
  });

  if (!lock) {
    return new Response("Debate is busy. Retry.", { status: 409 });
  }

  try {
    const debate = await loadDebateState(debateId);

    assertDebateIsActive(debate);
    assertUserIsExpectedParticipant(debate, user.id);
    assertTurnDeadlineNotPassed(debate.activeRound);

    const bodyText = String(payload.get("bodyText") || "");
    const images = payload.getAll("images");

    assertArgumentLength(bodyText, debate.rulesSnapshot.argumentCharLimit);
    assertImageCount(images, debate.rulesSnapshot.maxImagesPerArgument);

    const moderation = await moderateDebateTurn({ bodyText, images });

    if (moderation.decision !== "approved") {
      await logRejectedTurnAttempt({
        debateId,
        userId: user.id,
        moderation,
      });

      return Response.json(
        { ok: false, code: "TURN_REJECTED", moderation },
        { status: 422 }
      );
    }

    const result = await acceptDebateTurnAndAdvanceState({
      debate,
      userId: user.id,
      bodyText,
      images,
    });

    return Response.json({ ok: true, result });
  } finally {
    await releaseDebateLock(lock.id);
  }
}
```

## 7. Vote route skeleton

```ts
export async function POST(req: NextRequest, ctx: { params: Promise<{ debateId: string }> }) {
  const { debateId } = await ctx.params;
  const user = await requirePocketBaseAuth(req);
  const { roundId, side } = await req.json();

  const debate = await loadDebateState(debateId);
  const round = findRound(debate, roundId);

  assertVotingOpen(round);
  assertForumMember(debate.forumId, user.id);
  assertNotParticipant(debate, user.id);
  assertSideValue(side);

  await upsertVote({
    debateId,
    roundId,
    voterUserId: user.id,
    side,
  });

  const tallies = await recomputeRoundVoteCounts(roundId);
  await updateRoundCachedVoteCounts(roundId, tallies);

  return Response.json({ ok: true, tallies });
}
```

## 8. Environment variables

At minimum:

```bash
POCKETBASE_URL=
POCKETBASE_SUPERUSER_EMAIL=
POCKETBASE_SUPERUSER_PASSWORD=
CRON_SECRET=
OPENAI_API_KEY=
```

If you split service credentials later, do it then.
Do not complicate this upfront.

## 9. Final implementation advice

- keep ordinary content hooks cheap
- keep debate routes explicit
- keep cron handlers idempotent
- keep record revisions on moderated content
- keep accepted debate arguments free of `pending`
- keep workflow and ordinary content as two different systems

## References

- PocketBase event hooks: `https://pocketbase.io/docs/js-event-hooks/`
- PocketBase routing: `https://pocketbase.io/docs/js-routing/`
- PocketBase HTTP requests from JS: `https://pocketbase.io/docs/js-sending-http-requests/`
- Vercel cron docs: `https://vercel.com/docs/cron-jobs`
