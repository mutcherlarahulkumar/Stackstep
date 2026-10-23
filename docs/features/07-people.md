# Feature 07 — People: enrollment, cohorts, internship status and staff

Onboarding without database access. Desktop web (People tab); college admins see a reduced
version. No new external services.

## Colleges and cohorts

- **Colleges** (platform admins add them): unique names, with counts of open internships,
  cohorts and college admins.
- **Cohorts** (platform admins): a *college* cohort belongs to one college; a *group* cohort is
  independent. Each has a program, a start date (within 30 days ago and a year ahead, checked
  in the chosen time zone) and a seat limit. Seats used = active or paused internships.

## Enrollment

- **By GitHub login, before the student has ever signed in.** A pending user is created and
  linked to the GitHub account on first sign-in (the login is matched case-insensitively).
- **One open internship per student.** Staff can't be enrolled. A student from another college
  can't join a college cohort.
- **College admins** must pick one of their college's cohorts; platform admins may enroll an
  independent student by picking a program and start date.
- **Optional flow**: its tasks are scheduled from the start date.
- **Welcome**: the team lead greets the student when the internship opens (9 AM local on day
  1 for future starts).
- **Roster import**: up to 500 rows (CSV with `github_login`, optional `name`, `email`; header
  aliases and BOM accepted). Each row is its own transaction with its own result; duplicates
  inside the file and invalid logins are flagged before sending; re-running is safe.

## Internship status

Active ⇄ Paused; Active/Paused → Completed or Cancelled (both final). The lead tells the student
on pause, resume and completion. A completed or cancelled student can be enrolled again.

## Staff

Platform admins grant **admin** or **college admin** (with a college) by GitHub login, before
or after the person signs in. Students with an open internship can't become staff. You can't
remove your own access, and there is always at least one platform admin. Roles are read from
the database on every request, so a revoke takes effect on the next click.

## Hand-ins in chat (feature 3/4 follow-up)

Sending a task for review, marking it done or finishing a quiz posts the student's note (with
the PR link and note) in the assigning persona's chat. After the usual reply delay the persona
answers: an "ok, I'll review it" for reviews, a nudge plus one reflection question for finished
work, or score-aware feedback for quizzes. Starting a task stays silent.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| PE1 | Duplicate college (any case); college admin creates a college | 422 `name` / 403 | backend `TestPeopleEnroll` |
| PE2 | Cohort with bad name, missing college, unknown program, old date, 0 seats | 422 per field | backend `TestPeopleEnroll` |
| PE3 | Enroll a login that never signed in, on a flow | 201 `user_created`; dates from the cohort; welcome message; flow scheduled | backend `TestPeopleEnroll`, E2E `people.spec.ts` |
| PE4 | Second open internship; staff login; cohort full | 422 `github_login` / `github_login` / `cohort_id` | backend `TestPeopleEnroll`, E2E (seat limit in import) |
| PE5 | No cohort: missing program/date; bad login, zone or email | 422 per field | backend `TestPeopleEnroll`, web `people.test.ts` |
| PE6 | College admin: no cohort, other college's cohort, own cohort; student caller | 422 / 422 / 201 / 403 | backend `TestPeopleEnroll` |
| PI1 | Import with duplicate, invalid and already-enrolled rows | each row reported; valid rows enrolled | backend `TestPeopleImport`, E2E |
| PI2 | Import re-run; empty; more than 500 rows; large body | already enrolled / 422 / 422 / 512 KB cap | backend `TestPeopleImport` |
| PI3 | CSV parsing: quotes, header aliases, BOM, no header | parsed; problems flagged per line | web `people.test.ts` |
| PS1 | Pause, resume, double pause, completed → active | 200 / 200 / 422 / 422; student sees status and a note | backend `TestEnrollmentStatus`, E2E |
| PS2 | Out-of-scope college admin; student; unknown status | 404 / 403 / 422 | backend `TestEnrollmentStatus` |
| PS3 | Re-enroll after completion | 201 | backend `TestEnrollmentStatus` |
| PR1 | Grant college admin before sign-in | role and college set; they see only their college | backend `TestStaffRoles`, E2E |
| PR2 | Missing college, role student, enrolled student, non-admin caller | 422 / 422 / 422 / 403 | backend `TestStaffRoles` |
| PR3 | Revoke; revoke yourself; demote yourself | access gone next request / 422 / 422 | backend `TestStaffRoles`, E2E |
| PR4 | Second admin demotes the first; unknown user | 200 / 404 | backend `TestStaffRoles` |
| HF1 | Start a task; send for review | silent / student message with PR link in the persona's chat | backend `TestHandInFollowUps`, `lead.TestHandInAndAcknowledge` |
| HF2 | Persona reply | arrives after the reply delay, not instantly | backend `TestHandInFollowUps` |
| HF3 | Quiz finished high / low; done | praise + question / pointer to the answer key / nudge + stable question | `lead.TestHandInAndAcknowledge` |
