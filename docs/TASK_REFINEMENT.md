# Task refinement review

This change uses ten focused refinement passes. Each pass addresses a different failure
mode; passing the same test repeatedly would not establish better tasks.

| Pass | Focus | Review outcome |
|---|---|---|
| 1 | Audit the actual starting curriculum | Found 11 assignments covering only days 1–5 of a flow labelled 30 days, sparse briefs, and external-only reading. |
| 2 | Sequence a complete learning path | Review in progress: build skills progressively across all 30 days, including lighter consolidation days. |
| 3 | Make individual assignments actionable | Review in progress: prerequisites, scenario, timebox, concrete deliverable, acceptance checks, and a clear stopping point. |
| 4 | Check exercises and assessments | Review in progress: exact DSA contracts and examples, quizzes, edge cases, and bounded starter exercises. |
| 5 | Close the feedback loop | Review in progress: visible reviewer criteria, revision tasks, retrieval, and reflection that asks for evidence. |
| 6 | Make lessons self-contained | Review in progress: original embedded Markdown with examples and debugging guidance; external references optional. |
| 7 | Support safe authoring | Review in progress: writing, preview, local Markdown import, and shared server/client validation. |
| 8 | Keep reading in the app | Review in progress: web and native readers, Markdown briefs, navigation back to the task, and legacy compatibility. |
| 9 | Inspect safety and usability boundaries | Review in progress: inert HTML, safe links, Unicode, long content, phone/dark layouts, and import races. |
| 10 | Validate the complete workflow | Review in progress: backend/web/browser regressions, curriculum import repeatability, native checks where available, and screenshots. |

Published and assigned tasks are snapshots. Curriculum improvements must be imported as a
new version without resetting student work or silently rewriting existing assignments.
The development fixture seed and production content import are separate operations.
