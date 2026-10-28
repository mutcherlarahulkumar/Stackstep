# Stackstep: what every feature does

Stackstep is a virtual internship. A student joins a simulated software team for 30 or 60
days: tickets land on their board each morning, "teammates" (personas played by mentors) talk
to them in chat, they hand in real pull requests, get reviewed, earn points, and finish with a
verifiable certificate. Colleges watch progress through their own view.

This guide explains each feature in plain words: who uses it, where it is, and what it does.
The engineering specs, with every edge case and its test, are in [`features/`](features).

**Who's who**

| Role | Who | Where they work |
|---|---|---|
| **Student** | An intern | Web app or mobile app |
| **Admin** | You and your mentors | Full console on a desktop browser; on a phone, only task allocation and the inbox |
| **College admin** (TPO / placement cell) | A college's staff | Same console, but only their own college's students |
| **Visitor** | Anyone with a certificate link | Public pages, no sign-in |

---

## 1. Signing in and trust

- **GitHub sign-in.** Everyone signs in with GitHub. There are no passwords to manage, and a
  student's GitHub login is how you enroll them.
- **Consent at first sign-in.** Before anything else, a short screen explains what Stackstep
  keeps and who can see it, with links to the full **Privacy notice** (`/privacy`) and **Terms**
  (`/terms`). It asks again only if you change the terms.
- **First-run guide (students).** Four quick steps: the board, the team chat, handing in a PR,
  and points/credits/AI. Shown once, on web or app.
- **Honest personas.** Each chat header says who's behind the character: "Played by a mentor"
  or "Mentor · some replies automatic", and every automatic reply says "Automatic reply" under
  it. Students are never misled into thinking a bot is a person.
- **AI team lead.** Teammates with automatic replies (the Team Lead by default) answer everyday
  messages with AI: short, encouraging, a next step or a question back, never solutions or
  promises about grades. Anything personal or sensitive is left for a mentor. If AI is off or
  busy, the old scripted replies answer instead.
- **Download my data.** Account menu → a JSON file of everything Stackstep holds about the
  person: profile, tasks, hand-ins, chat, AI conversations, points, credits, certificates and
  notes. In the app, this opens the web app.

## 2. The student workspace

**Where:** web `/workspace` (chats, conversation and board side by side on desktop; tabs on a
phone) and the mobile app (Chats and Tasks tabs).

- **Team chat.** One conversation per persona (team lead, engineering manager, …). Messages
  arrive live. Quick replies like "PR ready for review" help shy students start.
- **Task board.** One list: **To do** (anything with changes requested comes first), then
  **Waiting for review**, then a folded **Done** list. Each task has a brief, links, who
  assigned it, the due time and a "Next step" hint.
- **Task flow.** To do → In progress → hand in for review → done (or changes requested). Some
  tasks are self-checks the student marks done.
- **Hand-ins in chat.** When a student starts, hands in or finishes, their note and PR link
  appear in the assigning persona's chat. A little later the persona replies: "got it, I'll
  review", a reflection question, or quiz feedback.
- **Quizzes.** Multiple choice, graded on the spot, 3 attempts. Once finished, the answer key
  shows the right answers and what the student picked.
- **Task notes.** A private Markdown notebook per task (with preview). The student can switch
  on **Share with your reviewer**, and the reviewer then sees the notes next to the hand-in.
- **DSA practice pad (web).** On DSA tasks with example tests, students write a JavaScript
  solution and press **Run examples**. It runs in their own browser, never on our servers, and
  an endless loop is stopped after 3 seconds. **Insert my practice code** puts the code and
  results into the hand-in. The app shows the examples and links to the web to run them.
- **Rubric.** On tasks with a rubric, students see **What your reviewer checks** before
  handing in, then which criteria were met after review.
- **Progress panel.** The "50% done" button in the header opens it: completion against the
  certificate bar (70%), overdue, on time, points,
  the certificate once issued, and a **This week** recap with one honest line (e.g. "2 tasks
  finished, all on time").
- **Review time hint.** After handing in: "Reviews usually come back within a day."
- **Notifications (web).** Account menu → Notifications. While the Stackstep tab is in the
  background, students get a browser notification for persona messages, approvals, change
  requests and new tasks. The tab title shows unread counts, e.g. "(2) Workspace".
- **Status everywhere.** Every screen has loading, empty, error and offline states. A banner
  appears if the live connection drops, and messages catch up when it returns.

## 3. Points, credits and the AI study helper

- **Points.** Earned for finished tasks, with a bonus for on time. They count toward the
  certificate and the weekly report.
- **Credits.** Students start with 20. Each AI question costs 1. Finished tasks earn more, and
  admins can add or remove credits with a reason (shown in the student's history).
- **AI helper.** Powered by Groq. Students must say what they're trying,
  what they've tried and what happens. They get **hints, not answers**. There are daily limits,
  cooldowns and a few follow-ups per question. Mentors can read every helper conversation, and
  the helper says so. Without a Groq key, it simply shows as unavailable.

## 4. Admin console (desktop web, `/admin`)

The bar holds the daily work: **Students**, **Reviews** (with how many are waiting), **Inbox**
and **Insights** (Overview and Weekly report). Things you set up once live under **Setup**:
People, Flows, Task library and Personas.

- **Students.** Searchable list with open/in-review counts. Open a student to see:
  - tiles: progress (and the certificate code), points, credits (click for history), AI use
    (click to read their questions)
  - the task table, with hand-ins, authenticity warnings, rubric results and shared notes
  - actions: **Assign task**, **Assign/Change flow**, internship **Status** (pause, resume,
    complete, cancel), and the **…** menu (adjust credits, issue/view/revoke certificate)
- **Assign a task.** Title, type, brief and due time up front (plus the questions for a
  **quiz**). **More options** holds the persona, admin review or self-check, a **rubric** (up to
  8 criteria), **DSA example tests**, links and a later start time. The persona announces it in
  the student's chat.
- **Reviews.** Every hand-in waiting, oldest first, filterable by persona, with a 24-hour aim.
  Approve or request changes (with a note); tasks with a rubric open a checklist.
  **Draft with AI** reads the task, the rubric and the pull request's diff and fills in a
  decision, rubric ticks and a note. You edit it and press send; nothing goes out on its own. Warnings
  flag a PR in someone else's repository, or a link already handed in by someone else.
- **Inbox.** Every student conversation; reply as the persona. **Broadcast** sends one message
  to many students.
- **Flows.** Day-by-day courses (e.g. "React Frontend · 30 days"). Build drafts, publish
  versions, duplicate, and assign to many students at once. Tasks are scheduled in each
  student's time zone, and "surprise" tasks land at a random time in a window.
- **Task library.** Reusable tasks to add to flows. Flows keep their own copy, so editing the
  library never changes a published flow.
- **Personas.** The team characters: name, title, colour, and whether they auto-acknowledge
  messages.
- **People.**
  - **Enroll** students by GitHub login (even before they've ever signed in), one at a time or
    by **CSV import** (drag-and-drop or paste, up to 500 rows, each row reported).
  - **Colleges & cohorts**, with start dates and seat limits.
  - **Staff**: grant admin or college-admin access, or revoke it. There's always at least one
    admin, and you can't lock yourself out.
- **Insights → Overview.** Placement table for all students: progress, points, credits, last
  activity, certificate. The number tiles on top (inactive, overdue, ready for a certificate,
  certified) are also the filters. Sort, **CSV export**, and **nudge** students who've gone
  quiet for two days.
- **Insights → Weekly report.** Week by week: totals, a row per cohort, who **stood out**, and who
  **needs a nudge**. **Print** gives a clean page for placement cells, and there's a **CSV**.
- **Certificates.** Issue by hand. Below the 70% bar you're warned but may still issue. The
  team lead congratulates the student in chat. Revoking needs a public reason.
- **Notifications (web).** Staff can opt in too: student messages and new hand-ins while the
  tab is in the background, and the unread inbox count in the tab title.

**On a phone:** admins get **Assign** (pick a student, assign a task) and the **Inbox**. The
rest of the console asks for a desktop.

## 5. College admins (TPO / placement cell)

The same console, scoped to their college: their students, cohorts, reviews, overview and
weekly report. They can enroll students into their college's cohorts. Platform admins create
colleges and cohorts, and grant staff access.

## 6. Public pages (no sign-in)

- **Verify a certificate:** `/verify` (type a code) or `/verify/<code>`. Shows valid or revoked
  (with the reason), the student, program, dates and numbers.
- **Certificate:** `/certificate/<code>`. A designed A4 internship certificate with a seal and a
  QR code to the verification page. Print it, save it as PDF, or download a PNG or SVG.
- **Privacy** and **Terms** pages.

## 7. Web and app side by side

| Feature | Web | App |
|---|---|---|
| Sign-in, consent, first-run guide | ✓ | ✓ |
| Chat, board, hand-ins, quizzes | ✓ | ✓ |
| Persona tags, AI privacy note | ✓ | ✓ |
| AI helper | ✓ | ✓ |
| Task notes (write, share) | ✓ | ✓ |
| Rubric (see criteria and results) | ✓ | ✓ |
| Quiz answer key with "Your answer" | ✓ | ✓ |
| Progress, certificate, "This week" | ✓ | ✓ |
| DSA practice pad | runs code | shows examples, links to web |
| Download my data | ✓ | opens web |
| Background notifications | browser, while a tab is open | in-app unread badges |
| Admin: assign task, inbox | ✓ | ✓ |
| Admin: everything else | desktop web | links to web |

## 8. Coming soon (labelled in the product, nothing faked)

- **Payments (Razorpay):** paid seats and college bulk seats. Enrollment is manual for now.
- **GitHub PR checks:** automatic checks and hidden tests on pull requests.
- **Push notifications on phones:** needs an external push service (Firebase / Web Push keys).

## 9. Running it

- Production setup, step by step: [`PRODUCTION.md`](PRODUCTION.md)
- Every setting and local development: [`SETUP.md`](SETUP.md)
- Releases and app builds: [`RELEASING.md`](RELEASING.md)
- Database workflows: **Actions → Database · seed admins** (make GitHub users admins) and
  **Database · flush seeded data** (remove the demo data, or everything).
