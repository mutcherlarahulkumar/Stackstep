# Feature 27 — Review lab

Practice code review on pull requests with planted problems, on a review screen built into
Stackstep. Nothing calls GitHub: the pull requests, diffs and grading all live here
(`backend/internal/reviewlab`).

## For students

- **Review lab** (`/review-lab`, header and account menu) lists every practice pull request
  with its difficulty, language, size, how many problems are planted and the student's best
  score. A how-grading-works note sits on top.
- A pull request (`/review-lab/{key}`) looks like a code host's: title and number, an
  **Open** badge, who wants to merge which branch, and three tabs.
  - **Conversation**: the description (Markdown) and the commit timeline.
  - **Commits**: each commit with its short hash.
  - **Files changed** (opens first): a file list, then each file's diff with old and new line
    numbers, green added and red removed lines, collapsible files and a **New file** badge.
- Click a line number (or the **+** beside a line on hover) to comment on that line. Comments
  stay **Pending** until the review is finished, and can be deleted.
- **Review changes** opens the box to finish: an optional summary, and **Comment**,
  **Approve** or **Request changes**.
- After grading, the score, what was found and what was missed. Every planted problem shows
  under its line with its kind (bug, security, performance, accessibility), what was wrong and
  how to fix it. Each comment is marked **Found a problem** or **Not a planted problem**.
- **Review again** starts over. The last review stays on the exercise ("See what you missed").

## Grading (no AI)

- A comment counts for the planted problem it is closest to, when it is on the problem's lines
  or one line away. One comment never finds two problems.
- Score = problems found ÷ problems planted. Comments that point at nothing cost 5 points each
  after two free ones. Approving a pull request that has problems costs 10. Pass mark 60%.
- Practice is unlimited; the best score is kept.

## As a task

- A **code review** task can be a review lab pull request (admins pick one in the assign form,
  the library and the flow editor). It is then finished by grading, so its review mode is
  **self** and it has no rubric.
- The task shows **Practice pull request** with the best score and tries used, and a button to
  open it with `?task=`. The board hides **Mark done**.
- Three tries. Passing, or the third try, finishes the task with the best score; points scale
  with it, like quizzes.
- The app lists the lab and shows the task card; reviewing a diff opens on the web.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| RL1 | Library | Every exercise with its record; best score null until tried | Go `TestReviewLabPractice`, E2E `team-lab.spec.ts` |
| RL2 | Opening an exercise | Diff shown, planted problems never sent until graded | Go `TestReviewLabPractice` |
| RL3 | No comments, unknown verdict, a line not in the diff, a blank comment | 422 with field errors; the web refuses an empty review first | Go `TestReviewLabPractice`, `TestValidateReview`, web `review-lab.test.ts`, E2E |
| RL4 | Everything found with request changes | 100, passed, every problem revealed | Go `TestReviewLabPractice`, `TestGrade`, E2E |
| RL5 | Approve, noisy comments, a comment between two problems | 10 off; 5 off each after two; counts for the closest only | Go `TestGrade` |
| RL6 | A practice review as a manual-review task, an unknown exercise, on a non-code-review task | 422 | Go `TestReviewLabTask` |
| RL7 | Student marks it done by hand | 422 (finished by grading) | Go `TestReviewLabTask` |
| RL8 | Wrong exercise for the task, stale version | 422, 409 | Go `TestReviewLabTask` |
| RL9 | Three tries below the pass mark | Done after the third, best score kept, no tries left | Go `TestReviewLabTask`, E2E |
| RL10 | Phone width | The page fits; diffs scroll sideways inside their box | E2E `team-lab.spec.ts` @mobile |
| RL11 | Diffs and planted lines | Every planted line is an added line in the diff; hunk headers count right | Go `TestLibraryParses`, `TestHunkHeaders` |
