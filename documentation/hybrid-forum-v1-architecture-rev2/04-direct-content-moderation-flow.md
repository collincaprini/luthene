# Direct Content Moderation Flow

This file covers the part of the app where the browser writes directly to PocketBase.

That direct path is acceptable only because the content is hidden until approved.

## Which collections use this flow

Use this async hidden-pending pattern for:

- `posts`
- `post_comments`
- `debate_comments`

It also pairs naturally with direct reactions, but reactions themselves do not need moderation.

## Why this works

Because the important safety rule is enforced by data access, not by UI convention:

- other users do not see `pending`
- other users do not see `rejected`
- only `approved` content is public
- author can still see their own pending/rejected items

That preserves UX without requiring every ordinary write to go through Next.js.

## Submission lifecycle

## Create

1. browser submits a create request directly to PocketBase
2. collection create rule confirms:
   - authenticated
   - `authorId` matches the auth user
   - parent is valid and visible
3. create request hook normalizes:
   - `moderationStatus = "pending"`
   - `contentRevision += 1`
   - reset moderation result fields
   - `moderationRequestedAt = now`
4. record is saved
5. after-success hook inserts a `moderation_jobs` row
6. author sees the new content immediately in a “pending review” state
7. everyone else still cannot see it

## Update

1. browser submits update directly to PocketBase
2. update rule confirms ownership and allowed edit path
3. update request hook forces:
   - `moderationStatus = "pending"`
   - `contentRevision += 1`
   - clear old approval metadata
   - update `lastUserEditAt`
4. after-success hook inserts a new moderation job for the new revision
5. content disappears from public view until re-approved

## Delete

Do not use direct hard delete for authors in v1.

Recommended path:

- author updates `lifecycleStatus = "deleted"`

This avoids losing audit history and breaking parent/child UI assumptions.

## Required record fields

Each moderated collection should carry enough state for async processing to be safe.

### Minimum useful fields

- `moderationStatus`
- `contentRevision`
- `moderatedRevision`
- `moderationRequestedAt`
- `moderationCompletedAt`
- `lastUserEditAt`
- `lifecycleStatus`

### Why `contentRevision` matters

Without revisions, async moderation can approve stale content.

Bad flow without revisioning:

1. user submits version 1
2. moderation job is queued
3. user edits to version 2
4. old job approves version 1 result against version 2 record

That is a classic race.

With revisions, the worker can simply refuse to apply stale decisions.

## Queue strategy

Use the queue as the source of work, not “scan every collection constantly.”

### Queue row contents

Each job should include:

- collection name
- record id
- record revision
- status
- attempts
- next attempt time
- priority
- lock state

### Why queue rows help

- retries are explicit
- stale jobs are easy to detect
- backoff is easy
- audit is easier
- the moderation worker stays simple

## Moderation worker algorithm

Your Vercel cron moderation handler should do roughly this:

1. fetch queued jobs due now
2. claim/lock a small batch
3. for each job:
   - load the target record
   - if missing, mark stale
   - if lifecycle is deleted, mark stale
   - if `contentRevision != job.recordRevision`, mark stale
   - call moderation provider on the current content snapshot
4. apply result:
   - `approved` -> set record approved, set `moderatedRevision`
   - `rejected` -> set record rejected
   - uncertain -> `needs_review`
5. insert `moderation_events` row
6. finalize job row

## Suggested decisions

### Approved

Update:

- `moderationStatus = "approved"`
- `moderatedRevision = record.contentRevision`
- `moderationCompletedAt = now`
- set `publishedAt` if first approval and still null

### Rejected

Update:

- `moderationStatus = "rejected"`
- `moderationCompletedAt = now`

Optionally store a reason code visible only to the author, not public users.

### Needs review

Use this when the moderation output is uncertain or your policy requires manual review for certain categories.

Update:

- `moderationStatus = "needs_review"`

### Error

Do not flip the content itself to `error`.
Keep the content in `pending`.
Set the job row to retry with backoff.

## Author UX

This architecture only feels good if the author experience is explicit.

For any direct-created content, show one of:

- `Pending review`
- `Published`
- `Rejected`
- `Needs moderator review`

Suggested UX rules:

- optimistic insert into local list as pending
- subscribe to realtime updates on the same record
- when approval lands, remove the pending badge
- when rejection lands, show a private reason if available
- let the author edit a rejected item and resubmit

## Rate limiting and abuse

Direct writes to PocketBase mean you need some abuse controls outside Next.js.

For v1, keep it simple:

- require auth for ordinary writes
- require forum membership before topic/comment creation where appropriate
- add low posting quotas for brand new accounts if needed
- keep moderation cron frequent enough that spam does not pile up
- make moderators able to suspend users quickly

## Optional acceleration

The simplest safe version is:

- queue in hook
- cron picks it up every minute

That is usually enough for v1 because pending content is hidden.

If later you want faster approvals, add an optional after-success hook that sends a signed ping to a Next.js internal moderation endpoint. Do that only after the basic queue is stable.

## What **not** to do

- do not show pending content to everyone
- do not let the browser write moderation decisions
- do not approve based on stale revisions
- do not use frontend filtering alone as the visibility boundary
- do not put every comment through Next.js just because moderation exists

## References

- PocketBase client-side guidance: `https://pocketbase.io/docs/how-to-use/`
- PocketBase API rules and filters: `https://pocketbase.io/docs/api-rules-and-filters/`
- PocketBase JS event hooks: `https://pocketbase.io/docs/js-event-hooks/`
