# Feature 09 — Task notes, shared with the reviewer on request

The PM review asked for notes attached to tasks rather than a standalone notebook: students
write down what they tried, and a reviewer reading the hand-in gets the context. Web and app.

- One Markdown note per task, owned by the student. Released, non-cancelled tasks only; still
  editable after the task is done.
- Private by default. "Share with your reviewer" shows it next to the hand-in in the review
  queue and the student's task list in the admin console (`shared_note`, staff only).
- Saving empty text with sharing off removes the note. 20,000 characters; Markdown whitespace is
  kept. Explicit save (Ctrl/Cmd+Enter on web) with an "Unsaved changes" indicator.
- Write / Preview, rendered with the same safe Markdown as the AI helper (no raw HTML).
- Included in "Download my data".
- App: notes sit below the task's actions so the main button stays in reach.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| TN1 | No note yet | empty body, `updated_at: null` | backend `TestTaskNotes` |
| TN2 | Private note | saved as written; staff never see it | backend, E2E `notes.spec.ts`, Flutter `app_routing_test.dart` |
| TN3 | Shared note | in staff task list and review queue; never in the student's `/me/tasks` | backend, E2E, Flutter |
| TN4 | Clear and unshare | note removed; staff see nothing | backend |
| TN5 | 20,001 chars, control chars, missing `shared`; 20,000 multibyte chars | 422 / 422 / 422 / 200 | backend |
| TN6 | Other student, staff, future task | 404 / 403 / 404 | backend |
| TN7 | Dirty state | Save enabled only with changes; preview disabled when empty | web `notes.test.ts`, E2E |
