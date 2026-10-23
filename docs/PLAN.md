# Stackstep — Platform Plan

Source of truth for product scope: the *Stackstep — Architecture & Analysis* doc.
This file turns it into concrete platform decisions, a build order and the
rules every feature must follow.

## 1. Stack (latest stable, pinned)

| Layer | Choice | Version |
|---|---|---|
| API | Go + Gin, pgx, JWT, WebSocket (`coder/websocket`) | Go 1.27, Gin 1.12 |
| Database | PostgreSQL | 18 |
| Web | Next.js (App Router) + React + Tailwind CSS + Zod | Next 16.4, React 19.3, Tailwind 4.3, Zod 4 |
| Web UI kit | shadcn/ui (Radix primitives, components copied into `web/src/components/ui` and owned by us) + Lucide icons + Geist font | shadcn CLI 4.22 |
| Web language | TypeScript, `strict` + `noUncheckedIndexedAccess` | 6.0 (TS 7 is out but `typescript-eslint` supports only `<6.1` today) |
| Mobile | Flutter (iOS + Android) + Riverpod | Flutter 3.47, Dart 3.13 |
| Mobile UI kit | shadcn_ui (Flutter port of shadcn: same violet palette, Geist font, Lucide icons) + our components in `mobile/lib/ui` | 0.57 |
| E2E | Playwright against the real API + Postgres | 1.64 |
| CI/CD | GitHub Actions, GHCR images, GitHub Releases | — |
| UI MCP servers | `shadcn` MCP (browse/add registry components from Claude) and Orshot MCP (generated visuals: OG images, certificates, store screenshots), both in `.mcp.json` | — |

Versions are pinned exactly (no `^`/`latest`) and bumped by Dependabot PRs.

## 2. Who uses which surface

The rule: **students live on mobile and web; admins live on desktop web.**
The one admin job allowed on small screens is **task allocation**, because it is
quick and often done on the move.

| Capability | Student · Mobile app | Student · Web | Admin · Mobile app | Admin · Web (phone/tablet < 1024px) | Admin · Web (desktop ≥ 1024px) |
|---|---|---|---|---|---|
| Sign in with GitHub | ✅ | ✅ | ✅ | ✅ | ✅ |
| Chat with AI team lead | ✅ (home screen) | ✅ | — | — | — |
| Task board (move own tasks) | ✅ | ✅ | — | — | — |
| **Assign a task to a student** | — | — | ✅ | ✅ | ✅ |
| Review a task (approve / request changes) | — | — | — | Desktop prompt | ✅ |
| Students overview, cohorts, reports | — | — | Desktop prompt | Desktop prompt | ✅ |
| Payments, refunds, content authoring | — | — | Desktop prompt | Desktop prompt | ✅ |

"Desktop prompt" = a full-screen card: *"The admin console is built for a larger
screen. Open stackstep on a desktop. You can still assign tasks here."* with a
**Copy link** action and a button into task allocation. Admins never see the
student chat UI in the app.

College admins (`college_admin`) see the same admin surfaces, scoped to students
in their college's cohorts. Platform admins (`admin`) see everyone.

## 3. Repository layout

```
api/openapi.yaml        HTTP contract shared by web and mobile (enum drift checked in CI)
backend/                Go modular monolith (cmd/api, cmd/seed, internal/*)
web/                    Next.js app: student workspace + admin console
mobile/                 Flutter app: student chat/tasks + admin task allocation
e2e/                    Playwright tests driving web against the real API
docs/                   Plan + one spec per feature
.github/workflows/      CI per component, E2E, CodeQL, releases
```

## 4. Engineering rules (apply to every feature)

**One look everywhere.** Web and mobile share the shadcn violet palette, Geist type, Lucide icons and the same component names (Button, Badge, Card, Alert, Sheet, Toast). Screens compose our own components (`components/app/*` on web, `lib/ui/*` on mobile) instead of styling primitives ad hoc.

**Typing.** No `any` in TypeScript (lint error), every API response is parsed with
Zod before use. Dart runs `strict-casts`, `strict-inference`, `strict-raw-types`;
JSON is decoded by hand-written `fromJson` that throws on unknown enum values or
missing fields. Go uses named string types for every enum with an exhaustive
`Valid()` check; request bodies reject unknown fields.

**Bound cases.** Every feature spec has a *Bounds and edge cases* table. Each row
has a test (Go integration test, web unit test, or E2E). No row, no merge.

**Errors.** One envelope everywhere:
`{"error":{"code":"validation_failed","message":"…","fields":{"title":"…"}}}`.
`code` is a closed enum mirrored in all clients; UIs map codes to human copy,
never show raw messages from the network.

**Concurrency.** Mutations on shared rows carry `expected_version`; mismatch → `409 version_conflict`.
Client-created records carry a client UUID so retries are idempotent.

**UI/UX bar.** Every screen ships with: loading skeleton, empty state with a next
action, error state with retry, offline banner (mobile), keyboard navigation and
visible focus (web), dark mode, 44pt touch targets, and copy reviewed for tone.
Optimistic updates roll back visibly on failure.

## 5. Build order (one vertical slice at a time)

Each slice goes **backend → mobile app → web**, with E2E before it is called done.

| # | Feature | Status |
|---|---|---|
| 1 | **Workspace core: sign-in, task allocation, task board, chat with the team lead** | ✅ built — see `docs/features/01-workspace.md` |
| 2 | Daily scheduler (program day templates → tasks, surprise items in working hours) | next |
| 3 | GitHub App ingest + PR pipeline (webhooks, runner, hidden tests, AI review) | |
| 4 | LLM-backed team lead (two model tiers behind the `lead.Agent` interface) | |
| 5 | DSA tab on the judge, quizzes, doc-reading tasks | |
| 6 | Razorpay payments, entitlements, group and college seats, bulk import | |
| 7 | Scoring, completion, certificates (Orshot-rendered), verify page | |
| 8 | Placement dashboard, nudges, exports | |

## 6. Releases

- Conventional Commit PR titles → release-please keeps a release PR open; merging it tags
  `vX.Y.Z` and `release.yml` re-verifies, then publishes API binaries (linux/darwin,
  amd64/arm64), multi-arch GHCR images for API and web, Android APK/AAB and an iOS IPA.
- Signing (Play / App Store) switches on automatically when the signing secrets
  listed in `docs/RELEASING.md` exist.
