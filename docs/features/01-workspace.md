# Feature 01 — Workspace core

Sign-in, task allocation by admins, the student's task board, and the chat with
the AI team lead. This is the loop every later feature plugs into.

## User stories

1. A student signs in with GitHub and lands on the chat with their team lead.
2. An admin (platform or college) picks a student and assigns a task. The task
   appears on the student's board and the lead announces it in chat.
3. The student moves the task: start → submit for review → (changes requested → resubmit) → done.
4. An admin reviews a submitted task on desktop: approve or request changes with a note.
5. The student chats with the lead; the lead replies after a realistic delay.
   Messages arrive live over WebSocket on every open device.

## Roles

| Role | Can |
|---|---|
| `student` | Read own tasks and chat. Move own tasks through student transitions. Send chat messages. |
| `college_admin` | List students in their college's cohorts, assign/review/cancel their tasks. |
| `admin` | Same as college admin, for every student. |

## Task model

`type`: `feature` · `bug_fix` · `dsa` · `doc_reading` · `quiz` · `git_chore` · `code_review` · `standup`

`status` and who may move it:

```
             student            student             admin                admin
   todo ───────────▶ in_progress ───────▶ in_review ───────▶ done
                         ▲                   │
                 student │                   │ admin
                         └── changes_requested ◀┘
                               │ student (resubmit) ──▶ in_review

   any non-terminal ──admin──▶ cancelled          (done, cancelled are terminal)
```

Board columns (both clients): **Today** = `todo` + `in_progress`, **In review**,
**Changes requested**, **Done**. Cancelled tasks are hidden from students.
A task with `scheduled_for` in the future is invisible to the student until then.

## API (see `api/openapi.yaml`)

| Method | Path | Who |
|---|---|---|
| POST | `/v1/auth/dev-login` | dev/test builds only |
| GET | `/v1/auth/github/start?client=web\|mobile` | anyone |
| GET | `/v1/auth/github/callback` | GitHub |
| POST | `/v1/auth/exchange` | mobile (one-time code → tokens) |
| POST | `/v1/auth/refresh` · `/v1/auth/logout` | signed-in |
| GET | `/v1/me` | signed-in |
| GET | `/v1/me/tasks` | student |
| POST | `/v1/tasks/{id}/transitions` | student or admin, per the graph |
| GET / POST | `/v1/me/messages` | student |
| GET | `/v1/admin/students?q=&cursor=&limit=` | admin, college_admin |
| GET / POST | `/v1/admin/enrollments/{id}/tasks` | admin, college_admin |
| GET | `/v1/ws` (subprotocols `stackstep.v1`, `bearer.<token>`) | signed-in |

## Bounds and edge cases

Every row is covered by a test; the *Test* column names where.

| # | Case | Expected | Test |
|---|---|---|---|
| A1 | No / malformed / expired access token | 401 `unauthenticated` | backend `TestAuth*` |
| A2 | Token signed with another key or `alg=none` | 401 | backend `TestAuthRejectsForgedTokens` |
| A3 | Refresh token reused after rotation | 401 and the whole token family is revoked | backend `TestRefreshReuseRevokesFamily` |
| A4 | Mobile one-time code used twice or after 60 s | 401 `invalid_code` | backend `TestExchangeCode*` |
| A5 | OAuth `state` tampered or older than 10 min | 400 `invalid_state` | backend `TestOAuthState*` |
| A6 | Dev login called in production | 404 | backend `TestDevLoginDisabledInProd` |
| A7 | Student calls an `/admin` route | 403 `forbidden` | backend `TestAdminRoutesForbidStudents` |
| A8 | College admin touches a student of another college | 404 `not_found` (no existence leak) | backend `TestCollegeAdminScope` |
| T1 | Title blank, < 3 or > 120 characters (after trim), or has control characters | 422 `validation_failed`, `fields.title` | backend + web + mobile validators |
| T2 | Brief > 8000 characters | 422 `fields.brief` | same |
| T3 | Unknown `type` | 422 `fields.type` | same |
| T4 | `scheduled_for` more than 5 min in the past, before enrollment start, or after enrollment end | 422 `fields.scheduled_for` | backend |
| T5 | `due_at` not at least 15 min after `scheduled_for`, or after the enrollment's last day | 422 `fields.due_at` | backend |
| T6 | Enrollment paused / completed / cancelled | 422 `enrollment_not_active` | backend |
| T7 | Unknown JSON fields, wrong JSON types, body > 64 KB | 400 `bad_request` / 413 `payload_too_large` | backend |
| T8 | Transition not allowed from current status, or not allowed for the actor's role | 422 `invalid_transition` | backend table test over the full graph |
| T9 | Two clients move the same task at once | second gets 409 `version_conflict`; UI refetches and explains | backend + web |
| T10 | Student moves a task that isn't theirs | 404 | backend |
| T11 | Request changes without a note, or note > 2000 chars | 422 `fields.note` | backend + web |
| T12 | Task scheduled in the future | absent from `/v1/me/tasks` until `scheduled_for` | backend |
| C1 | Message blank or > 4000 characters after trim | 422 `fields.body` | backend + web + mobile |
| C2 | Same `client_id` sent twice (retry) | one row; second call returns 200 with the same message | backend |
| C3 | More than 200 student messages in a UTC day | 429 `rate_limited` with `retry_after_seconds` | backend |
| C4 | Lead reply not yet due (`deliver_at` in future) | not returned by GET, not pushed | backend |
| C5 | Pagination `limit` outside 1–100 or bad cursor | 422 `fields.limit` / `fields.cursor` | backend |
| C6 | Socket drops | client reconnects with backoff (1 s → 30 s cap, jitter) and refetches the latest page; no duplicates (dedupe by id) | web + mobile |
| C7 | Socket opened without a valid bearer subprotocol | closed with 4401 | backend |
| C8 | Student has no active enrollment | `/v1/me` returns `enrollment: null`; clients show a "No active internship" empty state; message/task routes return 409 `no_active_enrollment` | backend + E2E |
| U1 | Admin opens console on < 1024 px | desktop prompt; "Assign a task" stays usable | web E2E (mobile viewport) |
| U2 | Admin signs in on the mobile app | lands on Assign task + desktop notice; never sees the student chat | mobile widget test |
