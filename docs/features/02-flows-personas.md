# Feature 02 — Flows, manager personas and team chat

Admins build **flows** (courses) out of a reusable **task library**, assign a flow to
students, and every task is scheduled automatically. Tasks are posted by **manager
personas** (Engineering Manager posts DSA, Delivery Manager posts development, Content
Lead posts blogs…), so a student's chat is a team inbox with one conversation per persona.
Admins answer as a persona, from desktop or phone. All review is manual by admins.

## Concepts

| Thing | What it is |
|---|---|
| **Persona** | A manager identity students chat with: name, title, color. Staffed by admins. `auto_reply` personas send a scripted acknowledgement (used by the default "Team Lead"). |
| **Task template** | Library entry: type, title, brief, persona, review mode, default release time and time-to-due. Reusable across flows. |
| **Flow** | A course for one stream ("React 30-day", "Go 60-day"): name, stream, 30 or 60 days. |
| **Flow version** | The flow's items. One **draft** is edited; **publish** freezes it as the new published version. Students keep the version they were assigned. |
| **Flow item** | A task placed on a day: copied from a template (title, brief, type, persona, review mode) plus release time and time-to-due. Copies, so later library edits never change a published flow. |
| **Review mode** | `manual` — student submits, an admin approves or requests changes. `self` — student marks it done (standups, readings). |

## Flows

- **Create** a flow → it starts with an empty draft.
- **Edit the draft**: add tasks from the library (or create a template inline), place them on
  days, set release time and time-to-due, reorder, remove. The editor saves the whole item
  list with `expected_revision`, so two admins can't silently overwrite each other.
- **Import from another flow**: pick a flow, pick some of its items, copy them into this
  draft (e.g. reuse the Git chores from "React 30-day" in "Angular 30-day").
- **Duplicate**: copy a flow's latest items into a new flow with its own name and stream.
- **Publish**: the draft becomes the published version; the previous one is retired but
  stays attached to the students who have it. A new draft is created from it on the next edit.
- **Assign**: to one student, or to many at once. Generates every task of the published
  version for the enrollment:
  - Release instant = internship day *N* at the item's release time, in the enrollment's time zone.
  - Days already over are skipped. Items earlier today are released now.
  - Due = release + time-to-due, kept inside the internship.
  - The persona announces each task in its conversation exactly when it releases.
  - Re-assigning replaces the old flow: its tasks not yet released are cancelled
    (released ones stay); the new flow is generated from now on.

## Chat

- Student inbox: one conversation per persona that has talked to them, newest first, with
  unread counts. Messages, unread and new tasks arrive live (WebSocket).
- Student messages go to that persona. Only `auto_reply` personas answer automatically.
- Admin inbox: all conversations in their scope with unread-from-student counts, filter by
  persona or unread. Reply as the persona. **Message students**: pick a persona, pick
  students (1–500), write once, each student gets it in that persona's conversation.
- Phones: admins get Assign task **and** Inbox (web and app). Flows, library and personas
  are desktop console only.

## API (added)

| Method | Path | Who |
|---|---|---|
| GET / POST | `/v1/admin/personas`, PATCH `/v1/admin/personas/{id}` | admin (college admins read) |
| GET / POST | `/v1/admin/task-templates`, PATCH `/v1/admin/task-templates/{id}` | admin (college admins read) |
| GET / POST | `/v1/admin/flows`, GET / PATCH `/v1/admin/flows/{id}` | admin (college admins read) |
| PUT | `/v1/admin/flows/{id}/draft` (whole item list) | admin |
| POST | `/v1/admin/flows/{id}/publish`, `/duplicate`, `/assign` | admin; assign: admin + college admin (own students) |
| PUT | `/v1/admin/enrollments/{id}/flow` | admin, college admin |
| GET | `/v1/admin/threads`, GET/POST `/v1/admin/threads/{enrollment}/{persona}/messages`, POST `…/read` | admin, college admin |
| POST | `/v1/admin/broadcasts` | admin, college admin |
| GET | `/v1/me/threads`, GET/POST `/v1/me/threads/{persona}/messages`, POST `…/read` | student |

`/v1/me/messages` is replaced by the per-persona thread routes.

## Bounds and edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| P1 | Persona name/title < 2 or > 60 chars, unknown color, duplicate name | 422 with field errors | backend `TestPersonas` |
| P2 | Archived persona used in a new template, item or message | 422 `fields.persona_id` | backend `TestPersonas` |
| P3 | College admin edits a persona, template or flow | 403 | backend `TestCatalogIsAdminOnly` |
| L1 | Template title/brief bounds, unknown type or review mode | 422 | backend `TestTemplates` |
| L2 | Release time not `HH:MM` 00:00–23:59; time-to-due outside 15 min–7 days | 422 | backend `TestTemplates` + domain |
| F1 | Flow name < 3 / > 80, duplicate name, stream < 2 / > 40, days not 30 or 60 | 422 | backend `TestFlows` |
| F2 | Draft item on day 0 or past the flow's last day; > 10 items on one day; > 600 items | 422 `fields.items[i].day` / `fields.items` | backend `TestFlowDraftBounds` |
| F3 | Saving a draft with a stale `expected_revision` | 409 `version_conflict` | backend `TestFlowDraftBounds` |
| F4 | Publish an empty draft, or with an archived persona | 422 | backend `TestFlowPublish` |
| F5 | Editing after publish | creates a new draft; published version unchanged | backend `TestFlowPublish` |
| F6 | Duplicate / import copies items; source unchanged | | backend `TestFlowDuplicate` |
| G1 | Assign a flow whose days ≠ the program's days, an unpublished flow, or to a paused enrollment | 422 | backend `TestAssignFlow` |
| G2 | Assign mid-internship | past days skipped, earlier-today items released now, future items hidden until release | backend `TestAssignFlow` |
| G3 | Re-assign | old flow's unreleased tasks cancelled and their announcements removed; released tasks kept | backend `TestReassignFlow` |
| G4 | Bulk assign: some enrollments out of scope or invalid | per-enrollment result; the valid ones succeed | backend `TestBulkAssign` |
| G5 | Generated task's due would pass the internship end | due clamped to the end (at least 15 min after release) | domain `TestMaterialize` |
| R1 | `self` task: student moves in_progress → done; `manual` task can't skip review | | domain + backend |
| C1 | Student messages a persona that never wrote to them | allowed only for non-archived personas; creates the conversation | backend `TestThreads` |
| C2 | Unread counts: persona messages not yet delivered don't count; reading resets | | backend `TestThreads` |
| C3 | Admin replies to a student outside their college | 404 | backend `TestThreadScope` |
| C4 | Broadcast to 0 or > 500 students, duplicate ids, or a body over 4000 chars | 422 | backend `TestBroadcast` |
| C5 | Admin inbox updates live when a student writes | staff WebSocket receives the frame | backend `TestStaffSocket` |
| U5 | Admin opens Flows / Library / Personas on a phone | desktop prompt; Inbox and Assign stay usable | E2E |
