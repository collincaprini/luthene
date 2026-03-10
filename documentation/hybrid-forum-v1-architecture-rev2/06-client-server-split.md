# Client / Server Split

This file answers one question clearly:

**Which actions should go direct to PocketBase, and which actions should go through Next.js?**

## Simple rule

### Direct to PocketBase

Use direct browser -> PocketBase when the operation is:

- a read, or
- an ordinary content write that can safely be hidden until moderation approves it, or
- a simple self-owned reaction/read-state action

### Through Next.js API

Use browser -> Next.js when the operation:

- changes authoritative workflow state
- depends on deadlines or timing
- changes multiple sensitive records
- requires synchronous moderation
- uses superuser/service credentials
- should stay opaque to the browser

## Read paths

Almost all reads stay direct.

### Public reads

- forum directory
- forum detail
- blog detail
- approved forum topics
- approved blog posts
- approved post comments
- debate page
- debate rounds
- accepted debate arguments
- leaderboard
- public user profile

### Authenticated reads

- own pending/rejected ordinary content
- private forum content for members
- own notifications
- own memberships and join requests
- debate comments visible to the user
- own vote state if you expose it

## Direct-write paths

These are acceptable direct browser -> PocketBase writes.

### Ordinary content

- create topic
- edit own topic
- soft-delete own topic
- create blog post
- edit own blog post
- soft-delete own blog post
- create post comment
- edit own post comment
- soft-delete own post comment
- create debate comment
- edit own debate comment
- soft-delete own debate comment

### Reactions

- add/remove post reaction
- add/remove post comment reaction
- add/remove debate comment reaction

### Simple self-owned support actions

- create join request
- cancel own join request, if allowed
- mark own notification as read

## Server-owned paths

These must go through Next.js.

### Containers and settings

- create forum
- update forum
- create blog
- update blog
- moderator edits to policy/settings

### Membership/moderation workflow

- approve or reject join request
- invite member
- ban/unban member
- promote/demote moderator
- moderator remove content
- moderator approve `needs_review` content

### Debate workflow

- create challenge
- accept challenge
- reject challenge
- submit turn
- cast/change vote
- manual forfeit

### Background/internal

- moderation sweep
- debate deadline sweep
- leaderboard updates
- cron logs
- moderation event writes

## Page/action matrix

| Page / feature | Read path | Write path |
| --- | --- | --- |
| forum list | direct PocketBase | none |
| forum page | direct PocketBase | join request direct; settings server |
| create topic | forum metadata direct | direct PocketBase create |
| topic page | direct PocketBase | comment/reaction direct |
| edit topic | direct PocketBase | direct PocketBase update |
| blog page | direct PocketBase | none |
| create blog post | blog metadata direct | direct PocketBase create |
| debate page | direct PocketBase | challenge/accept/submit/vote server |
| debate comments | direct PocketBase | direct PocketBase create/update |
| leaderboard | direct PocketBase | no direct writes |
| notifications | direct PocketBase | mark read direct |
| moderator review | direct PocketBase + filtered queries | moderator actions server |

## Why this split is cleaner than “all writes through Next”

Because it lets each tool do what it is actually good at.

### PocketBase is good at

- auth-scoped direct reads
- collection rules
- direct CRUD for safe user-owned content
- realtime updates
- cheap app-state plumbing

### Next.js is good at

- internal secrets
- sync moderation
- workflow orchestration
- cron handlers
- cross-record business logic
- future billing/webhooks

If you force all writes through Next.js, you are using it as a general-purpose auth proxy for problems that PocketBase rules already solve well.

## Realtime guidance

Use PocketBase realtime for:

- approval/rejection transitions on ordinary content
- new comments
- reaction changes
- debate round updates
- notification updates

Do not treat realtime messages as the system of record for state transitions.
They are just a UI update channel.

## Client rendering guidance

Given your preference for mostly client-rendered pages, the sensible v1 front end is:

- React client components
- PocketBase JS SDK
- TanStack Query or SWR for local cache/invalidation
- direct reads for page data
- direct ordinary writes where allowed
- server route mutations only for workflow operations

This keeps the Next server off the hot path for normal browsing.

## Where optimistic UI is safe

### Safe

- reactions
- local pending stub for new ordinary comments/posts
- mark notification read

### Use caution

- editing ordinary content that will disappear from public view until re-approved

### Avoid

- challenge acceptance
- turn submission
- vote completion
- forfeit
- any action that advances debate state

For those, show explicit loading and wait for the authoritative response.

## The practical summary

You are not building:

- “a Next app with PocketBase behind it”

You are building:

- “a PocketBase-first app with a small Next workflow/control plane”

That is the right shape for this project.
