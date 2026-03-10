# Architecture Principles and v1 Scope

This file freezes the decisions that should stop moving around before you start building.

If these stay unstable, the schema and route layer will thrash.

## Primary architecture principle

Treat the application as two different systems sharing one UI:

1. **content system**
   - topics
   - blog posts
   - comments
   - reactions

2. **workflow system**
   - debates
   - round deadlines
   - votes
   - forfeits
   - leaderboard

The first system tolerates async moderation and direct client writes.
The second system does not.

## Frozen v1 decisions

### Ordinary content

Ordinary content means:

- forum topics
- blog posts
- comments on posts
- comments on debates
- reactions

Ordinary content rules:

- create/update may go directly from browser to PocketBase
- create/update by normal users always becomes `pending`
- only approved content is visible to other users
- author can still see their own `pending` and `rejected` items
- any normal user edit sends the record back to `pending`
- ordinary content moderation is asynchronous

### Debate turns

Debate turns are not ordinary content.

Debate turn rules:

- submit via Next.js route only
- validate current participant, deadline, and limits first
- moderate text/images synchronously
- if moderation fails, no accepted argument exists
- if moderation passes, create argument and advance state
- debate turn moderation is synchronous

### Votes

Votes stay server-owned for v1.

Reason:

- one vote per round
- no participant voting
- membership check required
- cached counts may need recompute
- cron closes rounds and tallies results

### Ordinary media

For v1:

- ordinary posts/comments are text-only
- no images on normal posts in v1
- no images on normal comments in v1

This is not because images are impossible. It is because async moderation plus public file serving makes the first version messier than it needs to be.

### Debate media

Debate turns may include up to 2 images.

This is acceptable because:

- the submission already goes through a server route
- moderation happens before the argument is accepted
- only accepted arguments are stored as public debate turns

### Roles

Use only these roles in v1:

- `owner`
- `moderator`
- `member`

Do not build a generic RBAC system.

### Containers stay server-owned

These are server-owned actions:

- create forum
- update forum settings
- create blog
- update blog settings
- approve join requests
- invites / removals / bans
- moderator actions

They are rarer, more sensitive, and worth centralizing.

## Included in v1

- auth
- user profile basics
- forums
- forum membership
- join requests
- blogs
- forum topics
- blog posts
- post comments
- debate comments
- reactions
- debate challenges
- rounds
- debate arguments
- round voting
- forum leaderboard
- notifications
- moderation queue
- moderation event log
- cron deadline processing

## Explicitly deferred

- payments
- ads
- premium accounts
- direct messages
- post images outside debate turns
- advanced search
- full threaded comments
- custom moderator dashboard
- AI summaries
- ranking feeds
- SSR-heavy rendering
- mobile app

## Product defaults worth freezing now

### Forum defaults

```json
{
  "visibility": "public",
  "joinMode": "open",
  "postingMode": "members",
  "debatesEnabled": true,
  "moderationMode": "standard",
  "allowExternalLinks": true
}
```

### Debate defaults

```json
{
  "maxRounds": 3,
  "turnDurationHours": 12,
  "voteDurationHours": 12,
  "argumentCharLimit": 280,
  "maxImagesPerArgument": 2,
  "alternatingOpeningSide": true
}
```

These values should be copied from the forum onto the debate as a rules snapshot at creation time. Do not have active debates depend on live forum setting changes.

## URL strategy

Use IDs as the source of truth.
Use slugs only as decoration.

Recommended patterns:

- `/forums/{forumSlug}`
- `/forums/{forumSlug}/topics/{postId}`
- `/blogs/{blogSlug}`
- `/blogs/{blogSlug}/posts/{postId}`
- `/debates/{debateId}`

Do not block v1 on perfect slug uniqueness for every child object.

## Content format

Use markdown or lightly formatted plain text as the stored format for ordinary content.

Reasons:

- easier moderation preprocessing
- smaller payloads
- easier diffing/versioning later
- fewer editor bugs
- much easier than a rich-text AST in v1

Debate turns should be even stricter:

- plain text input
- hard character limit
- up to 2 images
- no long-form editor

## Lifecycle policy

### Ordinary content lifecycle

For posts and comments:

- `pending`
- `approved`
- `rejected`
- `needs_review`

Separate from moderation, also keep a simple lifecycle state:

- `active`
- `deleted`
- `locked`

`deleted` should mean user-removed or moderator-removed from normal reads.
Keep hard delete for admin cleanup only.

### Debate lifecycle

Debates use their own state machine and do not rely on `pending`.

At the match level:

- `pending_acceptance`
- `active`
- `completed`
- `forfeited`
- `cancelled`

At the round level:

- `awaiting_opener`
- `awaiting_response`
- `voting`
- `closed`
- `forfeited`

## Hard rule

If an action changes who is allowed to act next, what deadline applies, or who won, it is **not** ordinary content and does **not** go direct from the client to PocketBase.

That is the line.
