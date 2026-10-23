# Stackstep

A 30- or 60-day virtual internship that works like a real software job: an AI team lead
assigns work in chat, students ship real pull requests on their own GitHub, and the
certificate links to the work.

| Part | Stack | Path |
|---|---|---|
| API | Go 1.27 · Gin · Postgres 18 · WebSocket | [`backend/`](backend) |
| Web (students + admin console) | Next.js 16 · React 19 · Tailwind 4 · shadcn/ui | [`web/`](web) |
| Mobile (students + task allocation) | Flutter 3.47 · Riverpod · shadcn_ui | [`mobile/`](mobile) |
| Contract | OpenAPI 3.1 | [`api/openapi.yaml`](api/openapi.yaml) |
| End-to-end tests | Playwright | [`e2e/`](e2e) |

Plan and rules: [`docs/PLAN.md`](docs/PLAN.md) · Current feature spec with every edge case:
[`docs/features/01-workspace.md`](docs/features/01-workspace.md) · Releases:
[`docs/RELEASING.md`](docs/RELEASING.md)

## Who uses what

- **Students**: mobile app or web — chat with the team lead and work the task board.
- **Admins and college admins**: the web console on a desktop. On phones (web or app) they
  get a "switch to desktop" prompt, but **task allocation works everywhere**.

## Run it locally

```bash
make up                       # Postgres + API + web in Docker, seeded
open http://localhost:3000    # use "Developer sign-in" on /login
```

Or run pieces on the host: `make db seed`, then `make api`, `make web`, `make mobile`.
Seeded logins: `asha-dev`, `ravi-dev` (students), `nora-dev` (no internship),
`anits-tpo` (college admin), `admin-demo` (admin).

Real GitHub sign-in: create an OAuth app with callback
`http://localhost:3000/api/v1/auth/github/callback`, then set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` (and `BOOTSTRAP_ADMIN_GITHUB_LOGINS=<your-login>` to be an admin).

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
