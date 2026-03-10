# PocketBase Rule Strategy

This file is about the actual security boundary.

Do not rely on UI filtering for safety.
UI filtering is convenience.
**API rules are the real perimeter.**

PocketBase’s API rules are both access controls and record filters. Superusers bypass them. That is exactly what you want here.

## Rule philosophy

### 1. Public reads should be allowed only for already-visible records

For normal users and guests, public content collections should expose only records that are:

- in an active lifecycle state
- approved by moderation
- inside a visible forum/blog/container

### 2. Authors may see their own pending/rejected ordinary content

This is the UX feature that makes async moderation workable.

### 3. Normal users must never be able to mark content approved

That means rules and hooks together should ensure normal users cannot:

- create with `moderationStatus = approved`
- update into `approved`
- write moderation metadata
- write queue or audit records

### 4. Debate workflow records are mostly locked to normal users

Users may **read** debates.
They do not directly create/update/delete the workflow tables.

### 5. Reactions can be direct-write

Reactions do not need moderation and can be owned tightly by simple rules.

## Important implementation note

The starter expressions below are **shapes**, not final copy-paste rules.

PocketBase relation field names in filters depend on your actual schema and how the relation back-references appear.

Use these as templates and adjust the exact relation paths in the dashboard’s autocomplete.

## Collection posture matrix

| Collection | List/View | Create | Update | Delete |
| --- | --- | --- | --- | --- |
| `forums` | direct read | locked/server | locked/server | locked/server |
| `forum_memberships` | self + mods/owner | locked/server | locked/server | locked/server |
| `forum_join_requests` | self + mods | direct by requester | server/mod resolution | self cancel or server |
| `blogs` | direct read | locked/server | locked/server | locked/server |
| `posts` | direct read with filters | direct by author | direct by author | locked; prefer soft delete via update |
| `post_comments` | direct read with filters | direct by author | direct by author | locked; prefer soft delete via update |
| `post_reactions` | direct read | direct by self | rarely needed | direct delete by self |
| `post_comment_reactions` | direct read | direct by self | rarely needed | direct delete by self |
| `debates` | direct read | locked/server | locked/server | locked/server |
| `debate_rounds` | direct read | locked/server | locked/server | locked/server |
| `debate_arguments` | direct read | locked/server | locked/server | locked/server |
| `debate_votes` | direct read | locked/server | locked/server | locked/server |
| `debate_comments` | direct read with filters | direct by author | direct by author | locked; prefer soft delete via update |
| `debate_comment_reactions` | direct read | direct by self | rarely needed | direct delete by self |
| `forum_leaderboard_rows` | direct read | locked/server | locked/server | locked/server |
| `notifications` | self only | locked/server | self mark read | locked/server |
| `moderation_jobs` | locked | locked | locked | locked |
| `moderation_events` | locked | locked | locked | locked |
| `debate_processing_locks` | locked | locked/server | locked/server | locked/server |
| `cron_runs` | locked | locked/server | locked/server | locked/server |

## Starter rule goals by collection

## `posts`

### View/list goal

A normal viewer should only see posts where:

- lifecycle is active
- moderation is approved
- parent forum/blog is visible to them

The author should additionally see their own pending/rejected posts.

### Create goal

A normal user may create only if:

- authenticated
- `authorId` matches `@request.auth.id`
- parent container is valid
- user has permission to post there
- moderation state is `pending`
- lifecycle starts as `active`

### Update goal

A normal user may update only if:

- authenticated
- owns the post
- post is not locked
- update is an allowed edit path

The hook layer should then normalize the record back to `pending`.

### Delete goal

Prefer **no direct delete rule**.
Let authors soft-delete by updating `lifecycleStatus = "deleted"`.

This preserves auditability and reduces broken references.

### Starter expression shape for view/list

```txt
lifecycleStatus = "active"
&& (
  moderationStatus = "approved"
  || authorId = @request.auth.id
)
&& (
  (
    forumId = ""
    && blogId != ""
    && (
      blog.visibility = "public"
      || blog.ownerUserId = @request.auth.id
    )
  )
  || (
    blogId = ""
    && forumId != ""
    && (
      forum.visibility = "public"
      || forum_memberships_via_forum.userId ?= @request.auth.id
    )
  )
)
```

Adjust the relation names to your real schema.

## `post_comments`

Same pattern as `posts`, but visibility depends on the parent post and its container.

Important extra constraint:

- if the parent post is not readable, the comment must not be readable

## `debate_comments`

Same hidden-pending moderation pattern as other ordinary comments.

Visibility depends on:

- readable parent debate
- active lifecycle
- approved moderation unless the viewer is the author

## `post_reactions` and other reaction tables

Reactions are the easiest direct-write objects.

### Create goal

- authenticated
- `userId = @request.auth.id`
- target exists and is readable

### Delete goal

- authenticated
- `userId = @request.auth.id`

### Notes

Use a unique index so “toggle” can be implemented as:

- create if absent
- delete if present

## `forum_join_requests`

### Create goal

- authenticated
- `requesterUserId = @request.auth.id`
- forum join mode is `request`
- requester is not already a member
- only one row per forum/requester pair

### Update goal

Normal user may only cancel their own still-pending request, if you want that behavior.

Otherwise keep updates locked and use a server route.

## `notifications`

### View/list goal

- only the owner user can read them

### Update goal

Allow only limited self-updates:

- `isRead`
- `readAt`

Do not let users edit the rest of the notification payload.

A small `onRecordUpdateRequest` hook is useful here to reject any non-read-only field changes.

## `debates`, `debate_rounds`, `debate_arguments`, `debate_votes`

For v1, lock all create/update/delete rules.

Use:

- direct list/view rules for readable debates
- server-owned writes only

That gives you a clean hard boundary around the state machine.

## Internal collections

These should be rule-locked:

- `moderation_jobs`
- `moderation_events`
- `debate_processing_locks`
- `cron_runs`

Superuser only.

## Hidden fields and enrich hooks

Use hidden fields for:

- moderation summaries
- raw provider payloads
- queue locks
- internal processing flags

If you need slightly different views for staff and regular users, PocketBase’s enrich hook is the right place to hide/unhide fields dynamically.

## Hooks that should reinforce the rules

Rules are not enough by themselves. Use hooks to normalize records.

For `posts`, `post_comments`, and `debate_comments`:

- `onRecordCreateRequest`
- `onRecordUpdateRequest`
- `onRecordAfterCreateSuccess`
- `onRecordAfterUpdateSuccess`

Recommended responsibilities:

### In create/update request hooks

- force `moderationStatus = "pending"` for non-superusers
- clear old moderation summary fields
- increment `contentRevision`
- stamp `moderationRequestedAt`
- prevent edits to locked/deleted records if needed

### In after-success hooks

- enqueue a `moderation_jobs` row

That gives you one place to keep the invariants honest.

## Rule checklist

Before shipping, confirm all of these are true:

- normal user cannot create approved content
- normal user cannot update approved content without it becoming pending again
- normal user cannot read another user’s pending content
- normal user cannot read internal moderation collections
- normal user cannot write debate tables directly
- normal user cannot alter notification payloads except read state
- guest can read public approved content
- guest cannot read private forums/blogs
- forum moderators can read what they need
- superuser can do everything

## References

Official docs used for the assumptions above:

- PocketBase API rules and filters: `https://pocketbase.io/docs/api-rules-and-filters/`
- PocketBase how-to/client-side guidance: `https://pocketbase.io/docs/how-to-use/`
- PocketBase JS event hooks: `https://pocketbase.io/docs/js-event-hooks/`
