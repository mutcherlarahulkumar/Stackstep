# Feature 11 — Review rubrics

From the PM review: students should know what "good" looks like before they hand in, and
reviewers should judge every hand-in the same way.

- Admins add up to **8 criteria** (3–120 characters, no duplicates) to an admin-reviewed task
  in the assign form, the library or a flow. Quizzes and self-check tasks have none.
- The student sees **"What your reviewer checks"** in the task panel (web and app).
- Approving a task with a rubric, or requesting changes on one, opens the checklist (all ticked
  for approve, none for changes). The ticks are saved on that hand-in; a new hand-in starts fresh.
- The persona's chat message adds "Rubric: 2 of 3 criteria met". The student's panel then
  shows which were met; admins see the count next to the hand-in.
- Seeded React flow: the hero section and the projects grid have rubrics.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| RB1 | Rubric on quiz / self-check; 9 items; short, long, duplicate, control chars | 422 per field | domain `TestRubric`, web `content.test.ts`, E2E `rubric.spec.ts` |
| RB2 | Missing or wrong-length ticks on approve/changes; ticks on a task without a rubric | 422 `rubric` | domain `TestRubric`, backend `TestRubricReview` |
| RB3 | Student sends ticks | 422 | backend `TestRubricReview` |
| RB4 | Review with ticks | saved on the hand-in; student sees them; chat says "x of y criteria met" | backend, E2E, Flutter `models_test.dart` |
| RB5 | Hand in again after changes | new attempt has no ticks until reviewed | backend `TestRubricReview` |
