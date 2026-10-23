# Feature 03 — Task work: hand-ins, quizzes, links and surprise tasks

Students hand in real work, admins review it by hand, and quizzes grade themselves against
an answer key (no AI anywhere in this feature).

## What it adds

| Thing | Behaviour |
|---|---|
| **Links** (`content.resources`) | Up to 5 named `https://` links on any task, template or flow item (docs, starter repo, article). |
| **Hand-in** (`submission`) | Sent with the move to *In review*: a link (PR, post, repo) and/or a note. Feature, bug fix, Git chore, code review and blog tasks need a link; others need a link or a note. Optional when finishing a self-check task. Every hand-in is kept; reviewers see the latest. |
| **Quiz** (`content.quiz`) | 1–20 multiple-choice questions, 2–6 options each, one right answer, pass mark (default 70%). Quizzes are always self-check: the student submits answers (`POST /v1/tasks/{id}/quiz`), the server grades them. Passing, or using the 3rd attempt, finishes the task; the best score counts. Students see the answer key only once the quiz is finished. |
| **Surprise window** (`release_window`, templates and flow items) | 0–480 minutes. A flow item with a window releases at a stable pseudo-random time between its release time and release time + window, different per student. |

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| S1 | Submit for review without a link (link types) or without link/note (others); link not `http(s)`, has spaces or no host | 422 `submission.url` / `submission.note` | backend `TestSubmissions`, domain `TestValidateSubmission` |
| S2 | Hand-in stored; resubmission after changes requested is attempt 2; both student and staff see the latest | | backend `TestSubmissions` |
| S3 | Note over 4000 characters | 422 `submission.note` | domain `TestValidateSubmission` |
| Q1 | Quiz type without questions; questions on a non-quiz; quiz with admin review; < 2 or > 6 options; duplicate options; answer out of range; > 20 questions; pass mark outside 1–100 | 422 with `quiz…` field keys | domain `TestValidateContent`, backend `TestQuizzes` |
| Q2 | Student reads a quiz task before finishing it | options shown, `answer` is null; staff always see answers | backend `TestQuizzes` |
| Q3 | Wrong number of answers or an option that doesn't exist | 422 `answers` | backend `TestQuizzes` |
| Q4 | Failing attempt | stays in progress, attempts left shown; 3rd attempt finishes the task with the best score; a 4th is refused (422 `invalid_transition`) | backend `TestQuizzes` |
| Q5 | Student tries to move a quiz to done by hand, grade someone else's quiz, or grade a non-quiz | 422 `invalid_transition` / 404 / 422 `invalid_transition` | backend `TestQuizzes` |
| R1 | More than 5 links, link without a name, bad link | 422 `resources[i]…` | domain `TestValidateContent` |
| W1 | Surprise window over 8 h, or ending after 23:59 | 422 `release_window` | backend `TestSurpriseWindow` |
| W2 | Surprise items land inside their window, stable per student, different across students | | domain `TestSurpriseOffset`, backend `TestSurpriseWindow` |
| C1 | Content flows template → flow item → generated task unchanged | | backend `TestSurpriseWindow` |
