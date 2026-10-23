# Stackstep

A 30- or 60-day virtual internship that works like a real software job: a team of manager
personas assigns work in chat, students ship real pull requests on their own GitHub, and a
hand-issued certificate anyone can verify links to the work.

| Part | Stack | Path |
|---|---|---|
| API | Go 1.27 · Gin · Postgres 18 · WebSocket | [`backend/`](backend) |
| Web (students + admin console) | Next.js 16 · React 19 · Tailwind 4 · shadcn/ui | [`web/`](web) |
| Mobile (students + task allocation) | Flutter 3.47 · Riverpod · shadcn_ui | [`mobile/`](mobile) |
| Contract | OpenAPI 3.1 | [`api/openapi.yaml`](api/openapi.yaml) |
| End-to-end tests | Playwright | [`e2e/`](e2e) |

**Setup and every environment variable: [`docs/SETUP.md`](docs/SETUP.md)** · Plan and rules:
[`docs/PLAN.md`](docs/PLAN.md) · Releases: [`docs/RELEASING.md`](docs/RELEASING.md)

## Features

Each has a spec with every edge case and the test that covers it, in [`docs/features/`](docs/features):

1. **Workspace** — GitHub sign-in, task board, chat, task allocation (web and app).
2. **Flows and personas** — day-by-day flows, a task library, manager personas, a team inbox
   and broadcasts.
3. **Task work** — hand-in links, auto-graded quizzes, reading links, surprise tasks in
   working hours.
4. **Points, credits and the AI study helper** — the only AI in the product: Groq-powered
   hints for students, paid in credits, rate limited, and it makes students explain the
   problem and try things themselves first.
5. **Certificates** — progress against a 70% bar, issued by hand, public `/verify` page and a
   printable certificate.
6. **Placement overview** — cohort table, CSV export and nudges for inactive students.

Coming soon (labelled in the UI, nothing faked): Razorpay payments, GitHub PR checks,
AI review suggestions, Orshot certificate artwork.

## Who uses what

- **Students**: mobile app or web — chat with the team lead and work the task board.
- **Admins and college admins**: the web console on a desktop. On phones (web or app) they
  get a "switch to desktop" prompt, but **task allocation works everywhere**.

## Run it locally

```bash
cp .env.example .env          # optional: GROQ_API_KEY for the AI helper, GitHub OAuth
make up                       # Postgres + API + web in Docker, seeded
open http://localhost:3000    # use "Developer sign-in" on /login
```

Or run pieces on the host: `make db seed`, then `make api`, `make web`, `make mobile`.
Seeded logins: `asha-dev`, `ravi-dev`, `meera-dev` (students), `kiran-dev` (paused),
`nora-dev` (no internship), `anits-tpo` (college admin), `admin-demo` (admin).

Real GitHub sign-in, the Groq key, production settings and every variable are in
[`docs/SETUP.md`](docs/SETUP.md).

## Checks

```bash
make check     # contract + backend + web + mobile
make e2e       # with api and web running
```

CI runs the same on every PR (`.github/workflows`): Backend, Web, Mobile (Android + iOS
builds), API contract, E2E, CodeQL and a Conventional Commit PR-title check.

## UI tooling (MCP)

`.mcp.json` registers two MCP servers for Claude Code sessions in this repo:
**shadcn** (browse and add registry components) and **Orshot** (generated visuals such as
OG images, certificates and store screenshots — it needs an Orshot API key on first use).
