# Background Jobs and Cron

This file covers the work that should happen without a user page visit.

There are two cron responsibilities in v1:

1. ordinary content moderation sweep
2. debate deadline / result processing

## Why cron is necessary

Do not let the system advance only when someone opens a page.

That leads to:

- stale deadlines
- debates that never forfeit
- votes that never close
- moderation queues that pile up

You already decided to use Vercel cron hitting a secure API route for debate processing.
That is a good fit.
Use the same pattern for moderation.

## Recommended cron routes

- `GET /api/internal/cron/moderation`
- `GET /api/internal/cron/debates`

Keep them separate in v1.
They fail for different reasons and should be easy to inspect separately.

## Suggested schedules

For v1:

```json
{
  "crons": [
    { "path": "/api/internal/cron/moderation", "schedule": "* * * * *" },
    { "path": "/api/internal/cron/debates", "schedule": "* * * * *" }
  ]
}
```

Once per minute is enough to feel responsive without being overly clever.

## Verified Vercel behavior

Current official Vercel docs say:

- cron triggers your configured path with **HTTP GET**
- schedules are interpreted in **UTC**
- cron runs on **production** deployments, not preview
- if `CRON_SECRET` is set, Vercel sends it in the `Authorization` header
- route handlers can verify `Authorization: Bearer ${CRON_SECRET}`

That is the basis for the handler examples in this doc set.

## Security posture

Each cron route should:

1. read the `authorization` header
2. compare it to `Bearer ${process.env.CRON_SECRET}`
3. reject on mismatch
4. use a PocketBase superuser/service client internally

Do not expose these routes for normal browser use.

## Moderation cron

## Responsibilities

- claim due `moderation_jobs`
- load target records
- reject stale jobs
- call moderation provider
- apply decisions
- log moderation events
- schedule retries on transient failures

## Batch size

Keep it small at first:

- 10 to 25 jobs per run

You can increase later if approval latency becomes noticeable.

## Locking

The moderation queue can use job-level lock fields:

- `lockedAt`
- `lockId`

A job is claimable when:

- `jobStatus = queued`
- `nextAttemptAt <= now`
- no active lock exists

If a worker crashes, a later run may reclaim jobs whose lock is older than a timeout.

## Retry policy

Use backoff for provider/network errors:

- attempt 1 -> retry in 1 minute
- attempt 2 -> retry in 5 minutes
- attempt 3 -> retry in 15 minutes
- after that -> `needs_review` or `error`

Do not retry policy rejections. Those are terminal decisions.

## Debate cron

## Responsibilities

For each due debate:

- clean expired lock row if needed
- acquire debate lock
- load debate + active round
- apply exactly one due transition
- release lock

### Due transitions

#### Acceptance timeout

If debate is `pending_acceptance` and `acceptanceDeadlineAt <= now`:

- mark `cancelled`
- `completedReason = acceptance_timeout`

#### Turn timeout

If debate is `active` and round is awaiting a side and `turnDeadlineAt <= now`:

- mark round forfeited
- mark debate forfeited
- assign winner
- update leaderboard
- notify both users

#### Voting close

If round is `voting` and `votingEndsAt <= now`:

- tally authoritative votes
- close round
- create next round if needed, else finalize debate
- update leaderboard if match completed
- notify participants

## Debate lock discipline

Use the `debate_processing_locks` table for both:

- route handlers
- cron handlers

That way the same mutual-exclusion mechanism protects all debate transitions.

### Lock timeout

Use a short expiration window such as 30–60 seconds.

### Cleanup rule

Each cron run should opportunistically delete expired locks before trying to acquire new ones.

## Idempotency mindset

Cron code should be written so a repeated run is harmless.

Examples:

- if a debate is already completed, skip it
- if round 2 already exists, do not create it again
- if leaderboard row exists, upsert rather than blindly insert
- if a notification for a terminal event already exists, avoid duplicates if practical

## Suggested cron handler structure

### `/api/internal/cron/moderation`

1. verify `CRON_SECRET`
2. create `cron_runs` row with `started`
3. load claimable moderation jobs
4. process each job
5. finalize run log

### `/api/internal/cron/debates`

1. verify `CRON_SECRET`
2. create `cron_runs` row with `started`
3. load due debates ordered by `nextActionAt`
4. for each:
   - acquire lock
   - re-read current state
   - apply one transition
   - release lock
5. finalize run log

## What belongs in PocketBase hooks vs cron

### Hooks should do

- force/normalize ordinary content state
- bump revisions
- enqueue moderation jobs

### Cron should do

- expensive provider calls
- retries/backoff
- time-based debate transitions
- leaderboard updates
- notification fan-out

That split keeps hooks fast and predictable.

## Optional PocketBase scheduler

PocketBase also supports app-level scheduled jobs.
You could use that later for some internal work.

For this project, keep Vercel cron as the primary scheduler because:

- you already planned around it
- debate processing already belongs near the Next workflow layer
- one external scheduler is easier to reason about than two

## Monitoring

At minimum, log:

- start time
- finish time
- processed count
- error count
- summary payload

Use `cron_runs` until you decide you need a real log/metrics stack.

## Operational checklists

### Moderation cron healthy when

- pending queue is not growing without bound
- most jobs resolve in 1–2 minutes
- stale revision jobs are expected and not excessive
- error retries are rare

### Debate cron healthy when

- expired turns close within ~1 minute of deadline
- voting windows close within ~1 minute
- no lock rows pile up forever
- no duplicated next rounds appear

## References

- Vercel cron docs: `https://vercel.com/docs/cron-jobs`
- Vercel cron quickstart: `https://vercel.com/docs/cron-jobs/quickstart`
- Vercel cron management/security: `https://vercel.com/docs/cron-jobs/manage-cron-jobs`
- PocketBase JS jobs scheduling: `https://pocketbase.io/docs/js-jobs-scheduling/`
- PocketBase JS HTTP requests: `https://pocketbase.io/docs/js-sending-http-requests/`
