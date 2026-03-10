# Debate Workflow and API

Debates are the part of the app that must remain authoritative.

Do not treat them like ordinary posts.

## Why debates stay server-owned

A debate turn decides:

* whether the participant acted in time

* which side is expected next

* when the next deadline is

* whether voting is open

* whether the match is over

That is workflow, not just content.

So debate writes remain server-owned even though ordinary content can be direct-to-PocketBase.

## High-level design

* browser reads debate state directly from PocketBase

* browser performs debate mutations through Next.js routes

* Next.js route uses PocketBase superuser/service client

* route acquires a coarse debate lock

* route validates state

* route moderates the turn synchronously when needed

* route writes accepted state changes

* route releases the lock

## Top-level debate states

| Status               | Meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| `pending_acceptance` | challenge sent, opponent has not accepted yet               |
| `active`             | rounds are being played                                     |
| `completed`          | all rounds resolved normally                                |
| `forfeited`          | ended because one side missed or conceded                   |
| `cancelled`          | rejected, expired before acceptance, or moderator-cancelled |

## Round states

| Status              | Meaning                                 |
| ------------------- | --------------------------------------- |
| `awaiting_opener`   | opening side must post                  |
| `awaiting_response` | other side must respond                 |
| `voting`            | both turns posted, forum voting is open |
| `closed`            | round resolved normally                 |
| `forfeited`         | round ended on missed deadline          |

## API routes

These are the routes worth having in v1.

### `POST /api/debates`

Create a challenge.

#### Input

* `forumId`

* `opponentUserId`

* `title`

#### Validation

* requester is a forum member

* debates enabled for the forum

* opponent is also a valid member

* requester is not opponent

* no incompatible active challenge policy violation, if you choose to enforce one

#### Result

* create `debates` row with `pending_acceptance`

* set `acceptanceDeadlineAt`

* set `nextActionAt = acceptanceDeadlineAt`

* notify opponent

***

### `POST /api/debates/{debateId}/accept`

Accept a challenge.

#### Validation

* requester is the opponent

* debate still in `pending_acceptance`

* acceptance deadline not passed

#### Result

* acquire debate lock

* create round 1

* choose opener from rules snapshot

* set round to `awaiting_opener`

* set deadline

* set debate to `active`

* release lock

***

### `POST /api/debates/{debateId}/reject`

Reject a challenge.

#### Validation

* requester is the opponent

* debate still pending acceptance

#### Result

* mark `cancelled`

* `completedReason = rejection`

* notify challenger

***

### `POST /api/debates/{debateId}/submit-turn`

The most important route.

#### Input

* `bodyText`

* `images[]` (0..2 files)

* optional `clientMutationId`

#### Validation order

1. authenticate user
2. acquire debate lock
3. load debate + active round
4. verify debate is `active`
5. verify requester is the expected participant
6. verify round is `awaiting_opener` or `awaiting_response`
7. verify deadline not passed
8. verify character limit
9. verify image count limit
10. run moderation on text/images synchronously

#### Success result

* create accepted `debate_arguments` row

* if opener submitted:

  * round becomes `awaiting_response`

  * expected side flips

  * new turn deadline is set

* if responder submitted:

  * round becomes `voting`

  * expected side becomes `none`

  * voting end time is set

* debate `nextActionAt` is updated

* notifications emitted

* lock released

#### Failure result

* no accepted argument row

* no round advancement

* lock released

* optional `moderation_events` row written for audit

This route is intentionally **not** the async pending model.

A turn either counts or it does not.

***

### `POST /api/debates/{debateId}/forfeit`

Manual forfeit by participant.

#### Validation

* requester is challenger or opponent

* debate is active

#### Result

* acquire lock

* mark current round forfeited

* mark debate forfeited

* assign winner

* update leaderboard

* notify the other side

* release lock

***

### `POST /api/debates/{debateId}/vote`

Cast or change a vote.

#### Input

* `roundId`

* `side`

#### Validation

* debate round is in `voting`

* requester is a forum member

* requester is not a participant

* voting window still open

#### Result

* upsert `debate_votes` row

* recompute cached round vote counts

* return updated tallies

Votes are server-owned because membership checks and “participants may not vote” are core business rules.

## Why no `pending` accepted arguments

Because it creates needless ambiguity:

* did the turn count?

* should the deadline pause?

* can the other user respond yet?

* can cron forfeit the turn while moderation is pending?

The clean answer is:

* if moderation has not passed, the turn does not exist as an accepted argument

## Debate lock strategy

Since plain Next.js -> PocketBase admin calls are not a real multi-record SQL transaction, use a coarse lock row.

### Lock flow

1. try to create `debate_processing_locks` row with unique `debateId`
2. if a non-expired row already exists, reject/retry
3. do the mutation
4. delete the lock row

### Lock expiration

Use short expirations such as 30–60 seconds.

Before trying to create a new lock, opportunistically clean expired locks.

### Why this helps

It reduces conflicts between:

* two turn submissions

* route and cron

* accept/reject races

* manual forfeit and cron forfeit

It is not mathematically perfect, but it is the right level of discipline for v1.

## Debate lifecycle

## 1. Challenge created

* debate row created

* `status = pending_acceptance`

* `nextActionAt = acceptanceDeadlineAt`

## 2. Challenge accepted

* round 1 created

* `status = active`

* round status = `awaiting_opener`

* `nextActionAt = round.turnDeadlineAt`

## 3. Opener submits turn

* accepted argument created

* round status = `awaiting_response`

* expected side flips

* new turn deadline set

## 4. Responder submits turn

* accepted argument created

* round status = `voting`

* `votingEndsAt` set

## 5. Voting closes

Cron tallies the round from `debate_votes`.

* set round winner

* if more rounds remain: create next round

* else finalize debate and update leaderboard

## 6. Forfeit

Triggered by manual route or cron.

* set round forfeited

* set debate forfeited

* update leaderboard

## Overall winner rule

Keep this simple.

Recommended v1 rule:

1. more round wins wins the debate
2. tiebreaker = more total votes received across all rounds
3. if still tied, debate is a draw

This is easy to explain to users and easy to render.

## Cached counts vs authoritative truth

You may cache these on `debate_rounds` for UI speed:

* `challengerVoteCount`

* `opponentVoteCount`

But cron finalization should still query `debate_votes` as the source of truth.

That way even if cached counts drift briefly, the final result is correct.

## Failure handling

## Moderation provider slow/unavailable

For v1, use a conservative policy:

* return an error

* do not accept the turn

* ask the client to retry

You can add `paused_pending_review` later if you want, but it adds more state.

## Partial write risk

Because debate mutations are coordinated by the server and a coarse lock, not a true DB transaction, always write in the order that makes rollback/recovery easiest.

Recommended order for `submit-turn`:

1. validate everything first
2. moderate everything first
3. create accepted argument
4. update round
5. update debate
6. create notifications
7. release lock

If notification creation fails, do not fail the debate mutation after the state was already advanced. Log it and move on.

## Read model

All of these are direct-read from PocketBase:

* debate summary

* active round

* accepted arguments

* vote counts

* leaderboard

* debate comments

That keeps debate pages fast while preserving server authority on mutations.

## Future upgrade path

If you later start hitting edge-case race bugs, move only debate mutations into a PocketBase custom route or extension so the state machine lives closer to the DB.

Do not redesign the whole app.
Only upgrade the workflow subsystem.

## References

* PocketBase custom routing docs: `https://pocketbase.io/docs/js-routing/`

* PocketBase event hooks docs: `https://pocketbase.io/docs/js-event-hooks/`

