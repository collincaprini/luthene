# Build Plan and Checklists

This is the order I would actually build the project in if the goal is a credible v1 in roughly 12 weeks.

The main rule is:

- get the ordinary content pipeline stable first
- only then build debates on top

Do not start with throwdowns.

## Week 1 — foundation

### Build

- PocketBase project bootstrapped
- migrations repository structure
- auth collection fields finalized
- forums, blogs, and memberships collections created
- basic client-side PocketBase SDK setup in Next app
- simple public browsing pages

### Exit criteria

- user can sign up / sign in
- user can browse public forums/blogs
- forum membership rows exist and read correctly

---

## Week 2 — posts and comments

### Build

- `posts`
- `post_comments`
- direct reads for topic/post pages
- direct client create/update for posts/comments
- minimal editor components
- soft-delete flow

### Exit criteria

- user can create a topic
- user can create a blog post
- user can comment
- user can edit and soft-delete own content

---

## Week 3 — rule hardening

### Build

- API rules for posts/comments
- owner-only edits
- public approved-only reads
- author-visible pending/rejected reads
- hidden internal fields

### Exit criteria

- another user cannot see your pending content
- you can see your own pending content
- you cannot force an approved record from the client
- guests only see approved public content

---

## Week 4 — moderation queue

### Build

- `moderation_jobs`
- `moderation_events`
- create/update hooks for moderated collections
- revision bumping
- Vercel moderation cron route
- author-facing pending/rejected badges

### Exit criteria

- ordinary content enters `pending`
- cron approves/rejects it
- stale revision jobs do not mis-approve edited content
- moderation events are logged

---

## Week 5 — reactions, notifications, join requests

### Build

- reactions collections and toggles
- notifications
- join requests
- membership moderation UI for forum owners/mods

### Exit criteria

- reactions are stable
- notification read state works
- request-access forums are functional

---

## Week 6 — debate schema and read model

### Build

- `debates`
- `debate_rounds`
- `debate_arguments`
- `debate_votes`
- `debate_comments`
- `forum_leaderboard_rows`
- debate detail pages using direct reads only

### Exit criteria

- debate page can render a seeded debate correctly
- round and argument timeline displays cleanly
- leaderboard page reads correctly

---

## Week 7 — challenge / accept / reject

### Build

- create challenge route
- accept challenge route
- reject challenge route
- debate lock table + lock helpers
- notification fan-out

### Exit criteria

- challenge can be created
- accept creates round 1 correctly
- reject cancels correctly
- duplicate accepts/rejects are blocked

---

## Week 8 — submit turn with synchronous moderation

### Build

- submit-turn route
- turn validation
- text + image moderation
- accepted argument creation
- round state advancement
- UI loading/error states

### Exit criteria

- valid turn creates accepted argument
- invalid or late turn does not mutate state
- moderation failure does not create accepted argument
- opener -> response -> voting progression works

---

## Week 9 — voting and cron finalization

### Build

- vote route
- vote constraints
- cached count recompute
- debate cron route
- acceptance timeout
- turn timeout / forfeit
- voting close / next-round creation / match finalization
- leaderboard update

### Exit criteria

- one vote per user per round
- participants cannot vote
- missed turns forfeit correctly
- completed debate updates leaderboard exactly once

---

## Week 10 — moderator workflows

### Build

- moderator review for `needs_review`
- moderator removal/locking of ordinary content
- suspend user flow
- basic admin/power-user views in the app or through PocketBase dashboard guidance

### Exit criteria

- moderators can resolve hard cases
- locked content cannot be edited by authors
- suspended users cannot continue posting

---

## Week 11 — polish and abuse hardening

### Build

- pending/rejected UX polish
- error messages
- retry handling
- cron run log pages or simple admin summaries
- smoke tests around lock cleanup and moderation backlog

### Exit criteria

- app behavior is understandable without reading logs
- cron failures are visible
- pending content lifecycle feels coherent

---

## Week 12 — launch prep

### Build

- backup/export plan
- seed/demo data
- environment variable checklist
- production test pass
- forum moderation defaults reviewed
- copy and legal basics if needed

### Exit criteria

- can recover from a wiped environment using migrations + seeded config
- key flows work in production-like deployment
- one-page launch checklist is complete

## Manual test matrix

Run these before every real deploy in late-stage development.

### Ordinary content tests

- create post as user A -> only A sees pending
- moderation approves -> user B now sees it
- moderation rejects -> only A sees rejection
- edit approved post -> public can no longer see it until re-approved
- soft-delete own post -> public cannot see it
- user B cannot edit A’s post
- guest cannot see private forum content

### Reaction tests

- same user cannot duplicate same reaction
- same user can remove own reaction
- other user cannot delete your reaction

### Debate tests

- challenge created -> acceptance deadline set
- accept -> round 1 created with correct opener
- wrong participant cannot submit turn
- late turn rejected
- moderation failure does not create accepted argument
- opener turn advances to awaiting response
- responder turn opens voting
- participant cannot vote
- non-member cannot vote
- cron closes voting and advances or finalizes correctly
- cron forfeit works after missed turn deadline
- leaderboard updates only once

### Lock tests

- double submit-turn attempt -> one succeeds, one fails/retries
- cron and submit-turn cannot both mutate same debate at once
- expired locks are cleaned up

## Launch checklist

- `CRON_SECRET` set
- PocketBase superuser credentials stored securely
- production cron schedules enabled
- private env vars not exposed to client
- migrations applied cleanly
- backup routine tested
- moderator account exists
- at least one seeded forum exists
- at least one seeded debate and post for smoke checks
- moderation queue empty or healthy
- cron run logs green

## What not to do during the build

- do not add monetization before the core loops work
- do not add rich text before markdown/plain text feels sufficient
- do not add ordinary post images in the middle of this timeline
- do not redesign the schema after week 4 unless a real bug forces it
- do not build a custom admin dashboard unless the PocketBase dashboard is truly blocking you
