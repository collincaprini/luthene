# Social Media Hybrid Forum Platform — v1 Architecture (Revision 2)

This doc set updates the earlier architecture around one important split:

- **ordinary user content** can be written **directly from the browser to PocketBase**
- **ordinary user content is never public until moderation approves it**
- **debate turns and votes remain server-owned workflow actions**
- **Vercel cron** handles background moderation sweeps and deadline-driven debate processing

This version fits the stack better and avoids using Next.js as a general-purpose write proxy for everything.

## Core decisions

### 1. PocketBase is the primary app backend

Use PocketBase for:

- auth
- ordinary reads
- ordinary content writes
- realtime updates
- collection rules
- lightweight server-side hooks
- file storage

### 2. Next.js exists for the hard parts only

Use Next.js route handlers for:

- debate workflow transitions
- synchronous moderation of debate turns
- cron endpoints
- internal admin/service operations
- future payments/webhooks

### 3. Ordinary content uses hidden pending moderation

For regular posts and comments:

1. browser creates the record directly in PocketBase
2. PocketBase rules force the record into `pending`
3. public reads exclude `pending`
4. author can still see their own `pending` record
5. cron moderation promotes it to `approved` or marks it `rejected`

This preserves the good UX without forcing ordinary content creation through a Next.js route.

### 4. Debate turns do **not** use pending moderation

A debate turn is not just content. It is a workflow transition.

So the correct flow is:

1. browser sends the turn to a Next.js route
2. route validates turn ownership, deadline, limits, and membership
3. route moderates text/images synchronously
4. only if that passes does the route create the argument and advance debate state

No accepted turn, no state transition.

## Opinionated v1 cuts

These are deliberate to keep the build sane.

- **Ordinary posts/comments are text-only in v1**
- **Debate turns may include up to 2 images**
- **Comments are one-level nested at most**
- **Forum creation/settings stay server-owned**
- **Votes stay server-owned**
- **Moderation for ordinary content is async**
- **Moderation for debate turns is sync**
- **PocketBase admin UI is the first moderation back office**

The biggest practical cut is the first one. If you later want images on normal posts while keeping direct client writes, add a temporary upload/promotion flow. Do not do that in v1.

## File guide

| File | Purpose |
| --- | --- |
| [01-architecture-principles-and-v1-scope.md](./01-architecture-principles-and-v1-scope.md) | Frozen decisions and product boundaries |
| [02-pocketbase-collections.md](./02-pocketbase-collections.md) | Collection design, fields, indexes, and notes |
| [03-pocketbase-rule-strategy.md](./03-pocketbase-rule-strategy.md) | Rule posture by collection, with starter rule shapes |
| [04-direct-content-moderation-flow.md](./04-direct-content-moderation-flow.md) | Direct write + hidden pending moderation flow |
| [05-debate-workflow-and-api.md](./05-debate-workflow-and-api.md) | Debate lifecycle, routes, sync moderation, locks |
| [06-client-server-split.md](./06-client-server-split.md) | Page/action map for direct vs server paths |
| [07-background-jobs-and-cron.md](./07-background-jobs-and-cron.md) | Moderation sweep, deadline cron, retries, security |
| [08-build-plan-and-checklists.md](./08-build-plan-and-checklists.md) | 12-week solo build order and launch checklist |
| [09-hook-and-route-starters.md](./09-hook-and-route-starters.md) | Pseudocode starters for hooks, cron, and routes |

## System shape

```text
Browser
  ├─ direct reads ─────────────────────────────▶ PocketBase
  ├─ direct ordinary content writes ───────────▶ PocketBase
  │                                               ├─ rules force pending
  │                                               ├─ hooks bump revision
  │                                               └─ hooks enqueue moderation job
  │
  └─ workflow actions ─────────────────────────▶ Next.js API
                                                  ├─ challenge debate
                                                  ├─ accept / reject
                                                  ├─ submit turn
                                                  ├─ vote
                                                  └─ manual forfeit

Vercel Cron
  ├─ GET /api/internal/cron/moderation ───────▶ Next.js API
  └─ GET /api/internal/cron/debates ──────────▶ Next.js API

Next.js API
  └─ uses PocketBase superuser/service client ─▶ PocketBase
```

## Why this version is better than “server for all writes”

Because your own later reasoning was correct:

- you do **not** need Next.js in the write path for every ordinary comment or post
- if PocketBase rules are tight, the browser can create safe `pending` records directly
- the hard boundary is not “all writes”
- the hard boundary is “anything that changes authoritative workflow or must be moderated before it counts”

That distinction is what this revision is built around.

## Verified external assumptions

These docs assume the current official behavior below:

- PocketBase is designed to be used directly from client-side apps, with collection API rules acting as access controls and filters
- PocketBase supports API rules for list/view/create/update/delete, JavaScript request hooks, record hooks, custom routes, job scheduling, and outbound HTTP from hooks
- Vercel cron jobs call a configured path with **HTTP GET**
- Vercel cron schedules are interpreted in **UTC**
- Vercel cron runs only for **production**
- `CRON_SECRET` is sent in the `Authorization` header and can be checked as a bearer token

Reference URLs are listed again in the files that depend on them most heavily.

## Main implementation rule

Use this rule everywhere:

- **ordinary content** may be direct-to-PocketBase if rules force it into hidden `pending`
- **workflow/state changes** stay server-owned

That one line will keep the architecture coherent.
