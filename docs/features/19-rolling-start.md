# Feature 19 — Rolling start

Students don't wait for a batch date. Each one starts on day 1 the day after they join, on
the flow their cohort follows.

- **Cohorts have no start date.** A cohort is a program, a seat limit and the **flow** its
  students follow. Admins pick the flow when they add the cohort or later from the Cohorts
  table. Only published, unarchived flows as long as the program fit. Changing it affects
  students who join afterwards; everyone already enrolled keeps theirs.
- **Day 1 is tomorrow.** Approving a payment, or enrolling someone by hand, starts the
  internship on the next calendar day in the student's time zone. The flow (the reviewer's
  pick, else the cohort's) is scheduled from that day. Staff can still send an explicit
  `start_date` through the API for back-office fixes; the screens don't offer one.
- **The student is told straight away.** The team lead's welcome arrives the moment they're
  enrolled and says "Your first working day is tomorrow, Thursday 5 November. Your first task
  arrives at 9:30 AM IST." The payment confirmation in the application chat says the same.
  Before day 1 the workspace header reads "Starts tomorrow".
- Applications stay open for as long as an admin keeps a cohort open; there is no date to
  miss.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| RS1 | Create a cohort with a `start_date` | 400 unknown field; cohorts are created without one, flow optional | backend `TestRollingStart`, E2E `people.spec.ts` |
| RS2 | Payment approved | Enrolled from tomorrow on the cohort's flow; the confirmation names the first day and the first task's time | backend `TestApplicationHappyPathWithPartialPayment` |
| RS3 | Enroll by hand with no date or flow | Starts tomorrow on the cohort's flow; the welcome arrives now and names the day | backend `TestRollingStart`, E2E `people.spec.ts` |
| RS4 | Unknown, archived, unpublished or wrong-length flow; a college admin sets a flow | 422 `flow_id`; 403 | backend `TestRollingStart` |
| RS5 | Clear the cohort's flow | Next student starts with no tasks; admins assign a flow or tasks by hand | backend `TestRollingStart` |
| RS6 | Workspace before day 1 | "Starts tomorrow" (or the weekday and date further out) on web and app | web `people` helpers, Flutter `format_test.dart` |
| RS7 | Demo data flushed while a real cohort follows the demo flow | The cohort keeps going with no flow | backend `TestFlushAndAdmins` |
