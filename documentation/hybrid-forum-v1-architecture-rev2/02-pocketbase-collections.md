# PocketBase Collections

This schema is intentionally PocketBase-shaped, not academically pure.

The goal is simple:

* easy direct reads

* direct ordinary content writes where safe

* explicit workflow tables where debates need them

* enough denormalization to keep rules and queries sane

## Naming note

Collection names below are suggestions, not sacred.

Use consistent snake\_case or lower-case names across the whole project.

## 1. `users` (auth collection)

Use PocketBase auth collection for users.

### Additional fields

* `username`

* `displayName`

* `avatar`

* `bioMarkdown`

* `status` (`active | suspended`)

* `createdAt`

* `updatedAt`

### Notes

* Keep platform-level admins as PocketBase `_superusers`

* Do not invent a second “superadmin” concept in v1

* Forum-level moderation belongs in `forum_memberships`

***

## 2. `forums`

Container for communities.

### Fields

* `slug` (text, unique)

* `title`

* `descriptionMarkdown`

* `visibility` (`public | private | unlisted`)

* `joinMode` (`open | request | invite`)

* `postingMode` (`members | moderators`)

* `debatesEnabled` (bool)

* `moderationMode` (`standard | strict`)

* `allowExternalLinks` (bool)

* `debateConfigJson`

* `ownerUserId` (relation -> users)

* `status` (`active | archived | locked`)

* `createdAt`

* `updatedAt`

### Key indexes

* unique: `slug`

* index: `(visibility, status, createdAt)`

### Notes

* create/update server-owned

* public reads direct from PocketBase

***

## 3. `forum_memberships`

One row per user per forum.

### Fields

* `forumId` (relation -> forums)

* `userId` (relation -> users)

* `role` (`owner | moderator | member`)

* `membershipStatus` (`active | invited | banned`)

* `joinedAt`

* `updatedAt`

### Key indexes

* unique: `(forumId, userId)`

* index: `(userId, membershipStatus)`

* index: `(forumId, role, membershipStatus)`

### Notes

* server-owned writes only

* read rules allow self, owner, moderators

***

## 4. `forum_join_requests`

Direct-create collection for request-access forums.

### Fields

* `forumId`

* `requesterUserId`

* `status` (`pending | approved | rejected | cancelled`)

* `message`

* `createdAt`

* `resolvedAt`

* `resolvedByUserId`

### Key indexes

* unique: `(forumId, requesterUserId)`

### Notes

* direct create by the requester is acceptable

* moderator resolution stays server-owned

***

## 5. `blogs`

Organizational container for blog posts.

### Fields

* `ownerUserId`

* `slug` (unique)

* `title`

* `descriptionMarkdown`

* `visibility` (`public | private | unlisted`)

* `status` (`active | archived | locked`)

* `createdAt`

* `updatedAt`

### Key indexes

* unique: `slug`

* index: `(ownerUserId, status)`

### Notes

* blog creation/update should be server-owned

* blog posts live in `posts`

***

## 6. `posts`

Unified collection for forum topics and blog posts.

### Fields

* `postType` (`forum_topic | blog_post`)

* `forumId` (nullable relation -> forums)

* `blogId` (nullable relation -> blogs)

* `authorId` (relation -> users)

* `title`

* `bodyMarkdown`

* `excerpt` (optional denormalized summary)

* `lifecycleStatus` (`active | deleted | locked`)

* `moderationStatus` (`pending | approved | rejected | needs_review`)

* `contentRevision` (int)

* `moderatedRevision` (int)

* `moderationRequestedAt`

* `moderationCompletedAt`

* `publishedAt` (first approval time)

* `lastUserEditAt`

* `createdAt`

* `updatedAt`

### Key indexes

* index: `(postType, forumId, createdAt)`

* index: `(postType, blogId, createdAt)`

* index: `(authorId, createdAt)`

* index: `(moderationStatus, lifecycleStatus, createdAt)`

### Notes

* text-only in v1

* direct create/update allowed for normal users

* normal user edits always reset to `pending`

* use `publishedAt` for visible sort when appropriate, not only `createdAt`

***

## 7. `post_comments`

Comments on `posts`.

### Fields

* `postId` (relation -> posts)

* `authorId`

* `parentCommentId` (nullable self-relation; one-level nesting only)

* `bodyMarkdown`

* `lifecycleStatus` (`active | deleted | locked`)

* `moderationStatus` (`pending | approved | rejected | needs_review`)

* `contentRevision`

* `moderatedRevision`

* `moderationRequestedAt`

* `moderationCompletedAt`

* `publishedAt`

* `lastUserEditAt`

* `createdAt`

* `updatedAt`

### Key indexes

* index: `(postId, createdAt)`

* index: `(authorId, createdAt)`

* index: `(moderationStatus, lifecycleStatus, createdAt)`

### Notes

* direct create/update allowed

* text-only

* one-level reply depth only

***

## 8. `post_reactions`

Reactions on `posts`.

### Fields

* `postId`

* `userId`

* `reactionType` (`like` for v1, or small enum if desired)

* `createdAt`

### Key indexes

* unique: `(postId, userId, reactionType)`

* index: `(userId, createdAt)`

### Notes

* direct create/delete allowed

* no moderation required

***

## 9. `post_comment_reactions`

Reactions on `post_comments`.

### Fields

* `commentId`

* `userId`

* `reactionType`

* `createdAt`

### Key indexes

* unique: `(commentId, userId, reactionType)`

***

## 10. `debates`

Top-level debate match.

### Fields

* `forumId`

* `challengerUserId`

* `opponentUserId`

* `title`

* `status` (`pending_acceptance | active | completed | forfeited | cancelled`)

* `activeRoundNumber`

* `acceptanceDeadlineAt`

* `nextActionAt`

* `winnerUserId` (nullable)

* `completedReason` (`votes | draw | forfeit | rejection | acceptance_timeout | moderator_cancel`)

* `rulesSnapshotJson`

* `challengerRoundWins` (int)

* `opponentRoundWins` (int)

* `totalRounds`

* `acceptedAt`

* `completedAt`

* `createdAt`

* `updatedAt`

### Key indexes

* index: `(forumId, status, createdAt)`

* index: `(status, nextActionAt)`

* index: `(challengerUserId, createdAt)`

* index: `(opponentUserId, createdAt)`

### Notes

* create/update/delete server-owned

* readable directly by users who can view the forum

***

## 11. `debate_rounds`

Per-round state.

### Fields

* `debateId`

* `forumId`

* `roundNumber`

* `openingSide` (`challenger | opponent`)

* `expectedSide` (`challenger | opponent | none`)

* `status` (`awaiting_opener | awaiting_response | voting | closed | forfeited`)

* `turnDeadlineAt`

* `votingEndsAt`

* `nextActionAt`

* `winnerSide` (`challenger | opponent | draw | none`)

* `forfeitedSide` (`challenger | opponent | none`)

* `challengerVoteCount` (cached int)

* `opponentVoteCount` (cached int)

* `closedAt`

* `createdAt`

* `updatedAt`

### Key indexes

* unique: `(debateId, roundNumber)`

* index: `(status, nextActionAt)`

* index: `(debateId, status)`

### Notes

* cached vote counts are for UI speed only

* cron should use the authoritative vote records when finalizing

***

## 12. `debate_arguments`

Accepted turn content only.

### Fields

* `debateId`

* `roundId` (relation -> debate\_rounds)

* `forumId`

* `side` (`challenger | opponent`)

* `userId`

* `bodyText`

* `charCount`

* `images` (file array, max 2)

* `postedAt`

* `createdAt`

* `updatedAt`

### Key indexes

* unique: `(roundId, side)`

* unique: `(roundId, userId)`

* index: `(debateId, roundId)`

### Notes

* there is no `pending` debate argument in v1

* if moderation fails, no accepted argument is created

* because this route is server-owned, images are acceptable here

***

## 13. `debate_votes`

One vote per user per round.

### Fields

* `debateId`

* `roundId`

* `forumId`

* `voterUserId`

* `side` (`challenger | opponent`)

* `createdAt`

* `updatedAt`

### Key indexes

* unique: `(roundId, voterUserId)`

* index: `(roundId, side)`

* index: `(voterUserId, createdAt)`

### Notes

* server-owned writes

* participants may not vote

***

## 14. `debate_comments`

Non-workflow comments on the debate page.

### Fields

* `debateId`

* `forumId`

* `authorId`

* `parentCommentId` (nullable self-relation; max one level)

* `bodyMarkdown`

* `lifecycleStatus`

* `moderationStatus`

* `contentRevision`

* `moderatedRevision`

* `moderationRequestedAt`

* `moderationCompletedAt`

* `publishedAt`

* `lastUserEditAt`

* `createdAt`

* `updatedAt`

### Key indexes

* index: `(debateId, createdAt)`

* index: `(moderationStatus, lifecycleStatus, createdAt)`

### Notes

* direct create/update allowed

* this is commentary around the debate, not part of the accepted turn flow

***

## 15. `debate_comment_reactions`

Reactions on `debate_comments`.

### Fields

* `commentId`

* `userId`

* `reactionType`

* `createdAt`

### Key indexes

* unique: `(commentId, userId, reactionType)`

***

## 16. `forum_leaderboard_rows`

Per-forum per-user debate stats.

### Fields

* `forumId`

* `userId`

* `wins` (int)

* `losses` (int)

* `draws` (int)

* `forfeitsWon` (int)

* `forfeitsLost` (int)

* `debatesCompleted` (int)

* `updatedAt`

### Key indexes

* unique: `(forumId, userId)`

* index: `(forumId, wins, updatedAt)`

### Notes

* updated by server routes or cron only

* readable directly

***

## 17. `notifications`

Basic in-app notifications.

### Fields

* `userId`

* `kind`

* `title`

* `body`

* `linkUrl`

* `isRead`

* `createdAt`

* `readAt`

* `payloadJson`

### Key indexes

* index: `(userId, isRead, createdAt)`

### Notes

* server-created

* user may mark their own rows as read

***

## 18. `moderation_jobs`

Queue for async moderation of ordinary content.

### Fields

* `collectionName` (`posts | post_comments | debate_comments`)

* `recordId` (text)

* `recordRevision` (int)

* `jobStatus` (`queued | processing | approved | rejected | needs_review | stale | error`)

* `priority` (int)

* `attemptCount` (int)

* `nextAttemptAt`

* `lockedAt`

* `lockId`

* `errorSummary`

* `createdByUserId`

* `createdAt`

* `updatedAt`

### Key indexes

* index: `(jobStatus, nextAttemptAt, priority, createdAt)`

* index: `(collectionName, recordId, recordRevision)`

### Notes

* internal table only

* the queue decouples request handling from moderation timing

***

## 19. `moderation_events`

Immutable moderation audit log.

### Fields

* `collectionName`

* `recordId`

* `recordRevision`

* `decision` (`approved | rejected | needs_review | stale | error`)

* `provider`

* `reasonCode`

* `summary`

* `rawResponseJson`

* `moderatedBy` (`openai | moderator:{id}`)

* `createdAt`

### Key indexes

* index: `(collectionName, recordId, createdAt)`

* index: `(decision, createdAt)`

### Notes

* hidden/internal

* useful for debugging false positives and moderation drift

***

## 20. `debate_processing_locks`

Coarse lock rows for debate mutations and cron.

### Fields

* `debateId`

* `lockOwnerType` (`submit_turn | accept | reject | forfeit | cron`)

* `lockOwnerId` (request id / cron run id)

* `expiresAt`

* `createdAt`

### Key indexes

* unique: `(debateId)`

* index: `(expiresAt)`

### Notes

* this avoids concurrent route and cron processing on the same debate

* expired locks can be cleaned up opportunistically before use and in cron

***

## 21. `cron_runs`

Low-tech run log.

### Fields

* `jobName` (`moderation | debates`)

* `status` (`started | completed | partial | failed`)

* `startedAt`

* `finishedAt`

* `processedCount`

* `errorCount`

* `summaryJson`

### Notes

* internal only

* start with this before building real observability

## Fields that should usually be hidden from normal users

Mark these hidden or only expose via enrich logic when needed:

* moderation metadata

* moderation raw response

* queue internals

* lock internals

* internal summaries

* any staff-only notes

## Strong recommendation on migrations

Define these collections in versioned migrations instead of clicking everything manually.

Why:

* easier reset/rebuild

* schema changes stay reviewable

* indexes/rules remain reproducible

* much easier to recover from mid-project drift

