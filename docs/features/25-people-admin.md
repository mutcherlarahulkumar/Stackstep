# Feature 25 — People, profiles, notes and attendance

Admins get a free hand over everyone who uses Stackstep, and students see their attendance
grow as a forest.

## Directory (People, Everyone tab)

- Everyone who signed in or was added, most recently seen first, with a green dot when
  active in the last five minutes.
- Filters: Everyone, Interns (open internship), Not enrolled (signed in, no internship),
  Seen today, Staff. Narrow by cohort or flow, or search name, GitHub login or email.
- College admins only see people of their college.
- An info note tells admins what they can do across the console.

## Profile (tap a person)

Laid out like a contact card in a chat app: big avatar, name, `@login`, last seen, role and
day. Quick actions open GitHub, the team inbox, and email. Sections:

- **Notes**, a to-do list only staff see. Add, tick off, delete. Open ones come first.
  Attendance sits on top of the notes so it is always in view.
- **Attendance** with totals, the streak, a seat map and the forest.
- **Internships** (every one, newest first) and **Applications** (with status).
- **About**: GitHub, email, phone and college from the application, joined, last seen.
- **Sign out everywhere** (platform admins, not on themselves). Every refresh token is
  revoked and access tokens issued up to that second are refused, so the person signs in
  with GitHub again on every device. Work and chats are kept.

## Attendance

- Opening Stackstep (`GET /v1/me`) on a day of an active internship marks that day present,
  in the student's time zone. The seat is the order they arrived in that day, across everyone.
- Days from Day 1 to today: present, missed, or pending (today, not opened yet).
- The seat map is drawn like picking seats at the cinema. Present days are a computer with
  the seat number, missed days a dead tree, today a dashed seat.
- The forest is a 3D plot you can turn: a green tree per day present, a bare tree per day
  missed, a sapling for today. Students open it from **Progress, Show attendance** on the
  web and in the app (where it is drawn isometrically; drag sideways to turn it).

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| AT1 | Day 5, three visits, one miss, today not opened | 5 days, present 3, missed 1, streak 2, today pending | domain `TestAttendanceFor` |
| AT2 | Before the start; after the end | No days; stops on the last day | domain `TestAttendanceFor` |
| AT3 | Two students open the app; one opens it twice | Seats 1 and 2 in arrival order; the second visit changes nothing | backend `TestAttendanceMarkedOnOpen`, E2E `people-admin.spec.ts` |
| AT4 | The next day before opening | Today pending, streak unchanged; opening it marks present | backend `TestAttendanceMarkedOnOpen` |
| AT5 | No internship | 409 `no_active_enrollment` | backend `TestAttendanceMarkedOnOpen` |
| AT6 | Student opens Show attendance | Stats, the forest and the seat map; today present with a seat | E2E `people-admin.spec.ts` |
| AT7 | App | Strict decoding (unknown status refused); stats, forest and seats; turning the forest | Flutter `attendance_test.dart` |
| PA1 | Directory filters and scope | Applicants have no internship; college admins don't see other colleges; students get 403; bad kind 422 | backend `TestPeopleDirectoryAndProfile`, E2E `people-admin.spec.ts` |
| PA2 | Profile | GitHub link, internships, attendance and notes | backend `TestPeopleDirectoryAndProfile`, E2E `people-admin.spec.ts` |
| PA3 | Notes | Trimmed; blank refused; tick off; open first; delete; college admins can keep them too | backend `TestPeopleDirectoryAndProfile`, E2E `people-admin.spec.ts` |
| SO1 | Who may sign people out | College admins 403; on yourself 422 | backend `TestSignOutEverywhere` |
| SO2 | After a sign out | Old tokens 401 at once; a fresh GitHub sign in works | backend `TestSignOutEverywhere`, E2E `people-admin.spec.ts` |
