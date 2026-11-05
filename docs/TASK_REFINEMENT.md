# Task refinement review

This change went through twelve focused refinement passes. Each addresses a different
failure mode; repeatedly running the same passing test would not establish better tasks.

| Pass | Focus | Concrete outcome and evidence |
|---|---|---|
| 1 | Audit the actual starting curriculum | Found the checkout’s fixture flow had 11 assignments spanning only days 1–5, sparse briefs, and external-only reading. |
| 2 | Sequence a complete guided path | Added 45 tasks spanning all 30 days: foundations, React, an explorer, and a capstone. Core estimates total 2,965 minutes, with 45–145 minutes per day and lighter consolidation days. Structural tests check coverage, workload, and task bounds. |
| 3 | Make assignments runnable | Fixed the first PR’s missing base-branch prerequisite, supplied the initial HTML/CSS scaffold, and added explicit Node/Vite/TypeScript setup rather than assuming a React project exists. |
| 4 | Check exercises and assessments | Specified exact DSA output ordering and edge cases. Independent example oracles check 7 guided problems and 32 examples; the existing curriculum’s JavaScript verifier checks 54 problems and 246 examples. |
| 5 | Close the feedback loop | Manual tasks have visible review criteria; lessons ask for reproducible checks, a review question, revisions, retrieval, and evidence-based reflection. |
| 6 | Make lessons self-contained | Added 45 original embedded Markdown lessons, kept external publishing optional, and added an original Flexbox/Grid reading to the existing course. |
| 7 | Support safe authoring | Assignment/library/flow editors support writing, preview and append-only UTF-8 Markdown import. Fixed an import race that allowed saving before the read finished; bounded the editor’s height. |
| 8 | Keep reading in the app | Added web and native readers, Markdown briefs, Back navigation, and document presence on task cards. Native source parses; seven native tests are added but Flutter runtime validation remains blocked by SDK access. |
| 9 | Inspect safety and usability | Verified inactive document links, inert HTML, no remote image loading, raw Unicode/control bounds, legacy decoding, internal code/table scrolling, and reader Back/Escape/focus behaviour. |
| 10 | Validate across layers | Backend race tests, lint, contract checks, web tests/build, browser workflows, and desktop/phone light/dark screenshot review cover authoring through reading. All 44 browser tests passed on the merged implementation, including desktop and phone reader cases. |
| 11 | Preserve newer repository work | Integrated current main, retaining its existing 30-day and 60-day courses. Every existing course task also receives an in-app assignment guide. Published/assigned versions remain snapshots; importer tests check idempotence, rollback, authorization and preservation of user edits. |
| 12 | Execute student setup instructions | Created a clean temporary Vite React TypeScript project using the lesson’s commands, installed its test tools, and successfully ran a component test, production build and lint. Added missing deterministic async and browser-test setup instructions found during independent review. |

The combined backend run passed 153 top-level tests, 492 including subtests, with zero
failed or skipped tests. Nine packages contain no test files; those package-level skips
are not counted as executed tests. Web lint, type checking and all 115 unit tests passed.
The production web build and cross-language API contract checks passed. The full browser
suite passed 44 tests after correcting its local GitHub mock configuration and phone
board locator; the original failing checks were retained and rerun.

Published and assigned tasks are snapshots. The additional guided curriculum imports as a
separate edition without resetting student work; the existing course sync publishes changed
content for future assignments. The development seed is separate from production import.

Live-site inspection and GitHub PR API access were attempted using the supplied hostname
and existing authentication. Both currently return proxy 403 responses from this environment.
Required domains are saved in the environment draft; a draft save does not prove runtime
access. No native Flutter runtime pass or production deployment is claimed.
