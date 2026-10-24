# Feature 12 — Weekly report and the student's week recap

From the PM review: placement cells (TPOs) want a weekly summary they can forward, and
students should see how their week is going without doing maths.

## Weekly report (admins and college admins, desktop)

- **Report** in the admin nav. Weeks run Monday–Sunday (UTC); arrows move between weeks,
  up to 52 weeks back, never into the future.
- Totals: students (active), tasks finished, on-time %, hand-ins, certificates issued, quiet now.
- One row per cohort (independent students last) plus a totals row.
- **Stood out**: top 5 by points that week. **Needs a nudge**: up to 20 students who are quiet
  for two days, have 2+ overdue tasks, or (past weeks) finished nothing.
- **Print** gives a clean page (no app chrome). **CSV** has the cohort table with totals;
  cells are formula-safe.
- College admins only see their college's students.

## Student recap

The progress panel (web and app) shows **This week**: finished, on time, points and hand-ins,
with one honest line ("2 tasks finished, all on time. Keep it going.").

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| WR1 | This week | totals, cohorts, independents last, top students | backend `TestWeeklyReport`, E2E `report.spec.ts` |
| WR2 | Previous week; future week; bad date; > 52 weeks back | empty / 422 / 422 / 422 | backend, E2E |
| WR3 | College admin; student | own college only / 403 | backend |
| WR4 | Quiet student | listed under "Needs a nudge" with a reason | backend |
| WR5 | Student recap | same numbers as the report; honest line | backend, web `report.test.ts`, Flutter `progress_test.dart`, E2E |
| WR6 | CSV | header, rows, totals; formula-like cells quoted | web `report.test.ts`, E2E |
