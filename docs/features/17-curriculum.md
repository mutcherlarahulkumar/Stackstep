# Feature 17 — Stackstep curriculum (the real course content)

Stackstep ships its own two programs as code in `backend/internal/curriculum`, so the content is
reviewed, tested and versioned like everything else. One command (or the **Database · seed
curriculum** workflow) loads it into any database.

## What gets loaded

**Six personas.** Each one posts the kind of work a real teammate would.

| Persona | Title | Posts |
|---|---|---|
| Sam Rivera | Team Lead | standups, kickoffs, retros (auto-replies) |
| Ananya Rao | Engineering Manager | DSA problems, code reviews, CS pop quizzes |
| Vikram Menon | Delivery Manager | project tickets, Git chores, releases |
| Kabir Shah | QA Lead | bug tickets, testing work |
| Zoya Khan | Content Lead | readings and blog posts |
| Rohan Kulkarni | Backend Lead | API, database and auth tickets (60 days) |

**A task library** of 174 tasks: features, bug fixes, Git chores, code reviews, readings, blogs,
quizzes, standups and 54 DSA problems with practice pads (246 example tests). Every reviewed
task has a rubric, and every brief is Markdown with clear "hand in" steps.

**Two published flows.**

- **Frontend Internship · 30 days** (87 items).
  - Week 1: setup, Git, and a portfolio in HTML, CSS and JS.
  - Week 2: React, with Project 1, a task manager.
  - Week 3: routing, APIs and error states, with Project 2, Show Finder on the TVMaze API.
  - Week 4: testing, performance, CI, a capstone (StudyBuddy, SplitIt or Habitly), a viva and
    interview prep.
- **Full-stack Internship · 60 days** (159 items).
  - Weeks 1 to 3: the same as the frontend flow.
  - Week 4: tests with mocks, CI, rebasing and merge conflicts, with DSA on linked lists and
    recursion.
  - Weeks 5 and 6: a REST API in Express with PostgreSQL (Prisma), auth, security, tests,
    OpenAPI docs and deploying it, then connecting the task manager to it. DSA covers trees
    and heaps.
  - Weeks 7 and 8: a full-stack capstone, then system design, a viva and interview prep. DSA
    covers graphs and dynamic programming.

Hand-holding fades through each flow: early briefs give step-by-step guides, the middle weeks
give hints, and capstone tickets read like real tickets.

## Loading it

`go run ./cmd/dbadmin curriculum` (needs `DATABASE_URL`) or the workflow. It needs one platform
admin to own the content, and prefers a real admin over `admin-demo`, so flushing demo data
never removes it. `curriculum -dump` prints the content as JSON without a database. CI uses it
to run every DSA example against a reference answer (`scripts/check-dsa.mjs`).

Running it again is safe:

- unchanged content is left alone;
- a changed task updates its library entry;
- a changed flow gets a new published version, and the old one is retired. Students already on
  a flow keep the version they started with;
- if an admin has an unpublished draft of a flow, that flow is skipped with a note.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| CU1 | No platform admin yet | stops with "run Database · seed admins first" | `TestSync` |
| CU2 | First run | personas, every task and both flows (version 1) created; practice pads stored | `TestSync` |
| CU3 | Second run with no changes | nothing changes | `TestSync` |
| CU4 | Content changed (or edited in the database) | library task restored, each flow gets version 2, version 1 retired | `TestSync` |
| CU5 | An admin has an open draft of a flow | that flow is skipped with a note; the draft is untouched | `TestSync` |
| CU6 | Loaded next to demo data, then demo data flushed | no name clashes; both flows survive, owned by the real admin | `TestSyncAlongsideDemoSeed` |
| CU7 | Every task passes the app's own validation; every day has 1 to 4 items; DSA on most days; all task types used | build fails otherwise | `TestEveryTaskIsValid`, `TestFlowsCoverEveryDay` |
| CU8 | A DSA example has the wrong expected answer, or a starter doesn't parse | CI fails | `scripts/check-dsa.mjs` |
| CU9 | Copy has an em dash or a prose colon; reviewed work has fewer than 3 rubric items | test fails | `TestCopyStyle`, `TestReviewedWorkHasARubric` |
| CU10 | A persona name is taken by a different persona, or a flow name by a different flow | stops with a message saying what to rename | `syncPersonas`, `syncFlow` |
