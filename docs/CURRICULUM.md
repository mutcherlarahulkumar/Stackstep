# The guided React internship

The existing 30-day frontend and 60-day full-stack curricula remain available. Every task
now has an in-app assignment guide; syncing the curriculum publishes a new version for
new assignments while existing students keep their current snapshots.

The additional guided edition covers all 30 days with 45 tasks. It builds three connected artifacts: a personal
portfolio, a product explorer, and a small capstone grounded in a user's problem. The goal
is to produce work a student can explain, test, review, and improve—not to collect completed
checkboxes or promise a job.

## Guided learning path

| Days | Focus | Evidence of learning |
|---|---|---|
| 1–7 | Git, semantic pages, responsive layout, debugging, and retrieval | Small reviewed PRs, layout experiments, a reproducible bug fix, and a weekly reflection |
| 8–14 | React components, state, forms, async states, and tests | A working portfolio with derived state, truthful form behaviour, meaningful tests, and a revision after review |
| 15–21 | Product data contracts, request races, mutations, security, and accessibility | A resilient product explorer, failure-case tests, measured improvements, and an evidence-based demo |
| 22–30 | User research, capstone slices, regression checks, review, and release | A scoped capstone, verifiable PRs, a repeatable release, a case study, and a realistic next learning plan |

Assignments include an estimated effort, prerequisites, a concrete scenario, core work,
completion checks, and hand-in guidance. Stretch work is optional. Consolidation days leave
room to finish feedback, retrieve concepts without notes, and recover rather than adding
unbounded scope. A deadline is not a recommended amount of continuous work.

This is an internship practice path, not a zero-prerequisite programming course. Students
should have basic HTML/CSS/JavaScript, know how to use an editor and a terminal, and be able
to run a small local project. Mentors should use the first tasks to identify gaps, reduce
scope when necessary, and ask students to explain their own decisions. Do not reward an
unexplained copied solution as evidence of mastery.

## What makes a useful hand-in

For implementation work, students submit a small PR, the intended behaviour, checks they
actually ran, and an edge case or trade-off they want reviewed. For DSA, the exact input and
output contract, examples, and complexity argument matter alongside the code. Reflection
should connect a concrete observation to the next experiment. Writing can live as Markdown
in the student's repository; an external blogging account is optional.

Manual-review assignments expose their rubric before submission. Mentors should identify
the highest-impact gap, ask for a revision with a reproducible check, and distinguish a
required correction from an optional suggestion. The curriculum includes explicit review
and retrieval tasks so feedback changes the next piece of work.

## Read and author lessons in the app

Open a task's attached guide to read it without leaving the web or native app. Code,
checklists, tables, examples, and troubleshooting travel with the assignment. Existing
external resources remain optional further reading.

In the web task, library, or flow editor, add a document, write Markdown, and use **Preview**.
Alternatively, import a UTF-8 `.md` or `.markdown` file. Import adds a document and preserves
existing writing. A task may carry five documents, each with a title up to 80 Unicode
characters and a nonblank body up to 20,000 characters. The phone assignment form also
supports an authored reading and preview.

Raw HTML, executable links, and remote images are not part of the lesson reader. Store the
explanation in the document itself rather than depending on a remote image, iframe, or
relative file link. Task briefs support Markdown too.

## Add this edition without replacing student work

The original lesson sources are in
[`backend/internal/guidedcurriculum/lessons/`](../backend/internal/guidedcurriculum/lessons).
They are embedded into task content at build time. Library, published-flow, and assigned-task
documents are separate snapshots: editing a source file or library item never silently
rewrites a student's existing assignment.

The development seed includes the guided tasks in its familiar fixture flow. That seed is
for tests and disposable demos. **Do not reset a real database to install curriculum.**

From `backend/`, preview the versioned curriculum import first:

```bash
go run ./cmd/curriculum
```

The preview validates the curriculum without writing to the database. Applying the import
requires an existing platform admin and the intended database configuration:

```bash
go run ./cmd/curriculum --apply --admin-login your-admin-login
```

The import adds a separate guided flow and its library tasks. Repeating the same edition is
idempotent. It does not reassign students, erase their work, or edit an older published
curriculum. Review the new flow in the admin console and assign it intentionally. When
releasing a materially revised edition, change its version so existing snapshots remain
auditable.

The existing courses continue to use `go run ./cmd/dbadmin curriculum` and the
**Database · seed curriculum** workflow described in `docs/features/17-curriculum.md`.
That sync includes the new reader documents while preserving assigned versions.
