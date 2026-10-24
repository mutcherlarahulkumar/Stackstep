# Setup

Everything needed to run Stackstep locally, in Docker or in production, and every setting it
reads. Nothing outside this file is required.

- [1. What you need](#1-what-you-need)
- [2. Quick start with Docker](#2-quick-start-with-docker)
- [3. Run on your machine (for development)](#3-run-on-your-machine-for-development)
- [4. The AI study helper (Groq)](#4-the-ai-study-helper-groq)
- [5. Real GitHub sign-in](#5-real-github-sign-in)
- [6. API settings (backend)](#6-api-settings-backend)
- [7. Web settings](#7-web-settings)
- [8. Mobile build settings](#8-mobile-build-settings)
- [9. Tests](#9-tests)
- [10. Production checklist](#10-production-checklist)
- [11. CI and release settings](#11-ci-and-release-settings)
- [12. Troubleshooting](#12-troubleshooting)

## 1. What you need

| Tool | Version | Needed for |
|---|---|---|
| Docker + Docker Compose | recent | the one-command stack |
| Go | 1.27 | API, seed, backend tests |
| Node.js + pnpm | Node 24 LTS, pnpm 10 | web, E2E, contract check |
| Flutter | 3.47 | mobile app |
| Postgres | 18 (16+ works) | only if you don't use Docker for it |

## 2. Quick start with Docker

```bash
cp .env.example .env          # optional: add GROQ_API_KEY and GitHub OAuth here
make up                       # Postgres + API + web, migrated and seeded
```

Open <http://localhost:3000/login> and use **Developer sign-in**. Seeded accounts:

| Login | Who |
|---|---|
| `asha-dev`, `ravi-dev` | students in a college cohort |
| `meera-dev` | independent student on the seeded React flow |
| `kiran-dev` | student whose internship is paused |
| `nora-dev` | signed up, no internship (empty state) |
| `anits-tpo` | college admin (sees only their college) |
| `admin-demo` | platform admin |

Docker Compose reads the repo-root `.env` only to fill in `GROQ_API_KEY`, `GITHUB_*` and
`BOOTSTRAP_ADMIN_GITHUB_LOGINS`; everything else for local Docker is set in
`docker-compose.yml`. `make down` stops it; `docker compose down -v` also deletes the data.

## 3. Run on your machine (for development)

```bash
make db                                   # Postgres in Docker (+ a stackstep_test database)
cp backend/.env.example backend/.env      # edit if you like; `make api`/`make seed` load it
make seed                                 # migrate + reset to the demo data
make api                                  # http://localhost:8080 (migrates on start)
cp web/.env.example web/.env.local
make web                                  # http://localhost:3000
make mobile                               # Flutter app against the local API
```

The API runs migrations on every start, so a fresh database needs nothing else. `make seed`
(`go run ./cmd/seed -reset`) wipes workspace data and loads the demo again — never run it
against production.

Using your own Postgres: set `DATABASE_URL` (and `DB_URL`/`TEST_DB_URL` for the Makefile), e.g.
`postgres://user:pass@localhost:5432/stackstep?sslmode=disable`.

## 4. The AI study helper (Groq)

The only AI in Stackstep is the **student study helper**. Admin-side AI (review suggestions,
an AI team lead) is shown as *coming soon*; team-lead replies and reviews are manual.

1. Create a key at <https://console.groq.com/keys>.
2. Set `GROQ_API_KEY` for the API (repo-root `.env` for Docker, `backend/.env` for `make api`).
3. Restart the API. Students now see the helper; without a key it says "not set up yet" and
   asking returns `not_configured`.

How it's kept in check (all adjustable, see [§6](#ai-helper)):

- a fixed system prompt (hints and questions, not finished solutions) — `backend/internal/ai/prompt.go`;
- students must explain the problem in one go (goal, what they tried, error, code) before
  asking, with a built-in guide on writing good prompts;
- **1 credit per question**; students start with 20 and earn 1 per finished task; admins can
  add or remove credits with a reason; failed answers are refunded;
- a daily question cap, a cool-down between questions, and a longer wait before a follow-up
  so students try the hint themselves first; a global per-minute cap protects the Groq quota.

For local testing without a key, run the fake Groq server used by CI:

```bash
node e2e/scripts/fake-groq.mjs 8099 &
GROQ_API_KEY=e2e GROQ_BASE_URL=http://localhost:8099 make api
```

## 5. Real GitHub sign-in

Dev sign-in works only when `APP_ENV` isn't `production`. For real sign-in:

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
2. Homepage URL: your web URL (local: `http://localhost:3000`).
3. Authorization callback URL: `<web URL>/api/v1/auth/github/callback`
   (local: `http://localhost:3000/api/v1/auth/github/callback`).
4. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and, if the callback isn't the local
   default, `GITHUB_REDIRECT_URL`.
5. Set `BOOTSTRAP_ADMIN_GITHUB_LOGINS=<your-github-login>` so your first sign-in becomes a
   platform admin.

The mobile app signs in through the same OAuth app and returns via `MOBILE_REDIRECT_URL`
(`stackstep://auth`).

## 6. API settings (backend)

Read once at start-up by `backend/internal/config`. Invalid values stop the API with a list of
every problem. Template: [`backend/.env.example`](../backend/.env.example).

### Core

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — (**required**) | Postgres URL. Use `sslmode=require` in production. |
| `APP_ENV` | `development` | `development`, `test` or `production`. Production turns off dev sign-in and requires GitHub OAuth, https and real secrets. |
| `HTTP_ADDR` | `:8080` | Listen address. |
| `JWT_SECRET` | dev placeholder | Signs access tokens. **≥ 32 bytes; required in production.** Generate: `openssl rand -base64 48`. |
| `OAUTH_STATE_SECRET` | dev placeholder | Signs OAuth state. Same rules as `JWT_SECRET`; use a different value. |
| `WEB_BASE_URL` | `http://localhost:3000` | Public web URL. Must be https in production (session cookies are `Secure` then). |
| `ALLOWED_ORIGINS` | origin of `WEB_BASE_URL` | Comma-separated origins allowed to call the API and open the WebSocket. |
| `MOBILE_REDIRECT_URL` | `stackstep://auth` | Where GitHub sign-in returns to the app. |
| `TRUSTED_PROXIES` | `127.0.0.1/32,::1/128` | CIDRs whose `X-Forwarded-For` is trusted (for rate limits and logs). Include the web server / load balancer. |
| `PROXY_SHARED_SECRET` | empty | ≥ 32 characters. Set the **same value on the web app**; its proxy then passes each visitor's IP so rate limits are per student, not per proxy. Needed when the web app and API are on different hosts (e.g. Vercel + Render). |
| `AUTH_RATE_PER_MINUTE` | `30` | Per-IP limit for sign-in and public certificate checks. Raise (e.g. `1000`) for E2E. |
| `LEAD_REPLY_DELAY` | `45s` | How long the scripted team lead waits before replying (0–2h). |
| `DELIVERY_INTERVAL` | `1s` | How often scheduled messages are delivered (100ms–1m). |

### GitHub

| Variable | Default | Notes |
|---|---|---|
| `GITHUB_CLIENT_ID` | empty | OAuth app id. Required in production. |
| `GITHUB_CLIENT_SECRET` | empty | OAuth app secret. Required in production. |
| `GITHUB_REDIRECT_URL` | `http://localhost:3000/api/v1/auth/github/callback` | Must match the OAuth app. |
| `BOOTSTRAP_ADMIN_GITHUB_LOGINS` | empty | Comma-separated logins made platform admins on sign-in. |
| `GITHUB_OAUTH_BASE_URL` | `https://github.com` | Override only for GitHub Enterprise or tests. |
| `GITHUB_API_BASE_URL` | `https://api.github.com` | Same. |

### AI helper

| Variable | Default | Range | Notes |
|---|---|---|---|
| `GROQ_API_KEY` | empty | — | Empty turns the helper off. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | — | Any Groq chat model. |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | — | https required in production. Point at the fake server for tests. |
| `AI_TIMEOUT` | `25s` | 1s–1m | Per request to Groq. |
| `AI_DAILY_QUESTIONS` | `8` | 1–200 | New questions per student per local day. |
| `AI_QUESTION_COOLDOWN` | `2m` | 0–1h | Between new questions. |
| `AI_FOLLOWUP_COOLDOWN` | `5m` | 0–2h | Time to try the hint before a follow-up. |
| `AI_MAX_FOLLOWUPS` | `3` | 0–20 | Follow-ups per conversation. |
| `AI_GLOBAL_PER_MINUTE` | `30` | 1–10000 | All students together; keep under your Groq plan's limit. |

## 7. Web settings

Read by the Next.js server **at request time**, so one build or image works everywhere.
Template: [`web/.env.example`](../web/.env.example) → copy to `web/.env.local`.

| Variable | Example | Notes |
|---|---|---|
| `API_INTERNAL_URL` | `http://localhost:8080` (Docker: `http://api:8080`) | Where the web server proxies `/api/*`. The browser never calls the API directly, so the refresh token stays an HttpOnly same-site cookie. |
| `PUBLIC_WS_URL` | `ws://localhost:8080/v1/ws` (prod: `wss://api.example.com/v1/ws`) | WebSocket the browser opens for live chat and boards. Its origin must be in the API's `ALLOWED_ORIGINS`. |
| `DEV_LOGIN` | `true` | Shows the seeded-user sign-in panel. **Never enable in production** (the API refuses dev sign-in there anyway). |

Public pages (`/verify`, `/verify/{code}`, `/certificate/{code}`) need no extra settings.

## 8. Mobile build settings

Passed as `--dart-define` at build time:

| Define | Default | Notes |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8080` (Android emulator: `http://10.0.2.2:8080`) | The API. Use https in release builds. |
| `WEB_BASE_URL` | `https://stackstep.app` | Public web app; certificate verification links open here. |
| `WEB_CONSOLE_URL` | `https://stackstep.app/admin` | Desktop console link shown to admins. |
| `DEV_LOGIN` | off (on in debug builds) | Compile dev sign-in into a QA release build. |

```bash
cd mobile
flutter run --dart-define=API_BASE_URL=http://localhost:8080 --dart-define=WEB_BASE_URL=http://localhost:3000
```

## 9. Tests

| Command | Needs |
|---|---|
| `make check` | everything below except E2E |
| `make contract` | Node (runs Redocly and the enum drift check) |
| `make check-backend` | `TEST_DATABASE_URL` database (`make db` creates `stackstep_test`), golangci-lint |
| `make check-web` / `cd web && pnpm check` | Node + pnpm |
| `make check-mobile` | Flutter |
| `make e2e` | API with `AUTH_RATE_PER_MINUTE=1000` and the fake Groq (§4), web built and started (`pnpm build && pnpm start`); Chromium via Playwright |
| `cd mobile && STACKSTEP_LIVE_API=http://localhost:8080 flutter test test/live` | a seeded API; runs the app's API client against it |

Screenshots for design review: `node e2e/scripts/screenshots.mjs <out-dir>` with the stack
running and freshly seeded.

## 10. Production checklist

- `APP_ENV=production`, strong unique `JWT_SECRET` and `OAUTH_STATE_SECRET` (≥ 32 bytes).
- `WEB_BASE_URL` on https; `ALLOWED_ORIGINS` = the web origin; `PUBLIC_WS_URL` on `wss://`.
- GitHub OAuth app with the production callback; `BOOTSTRAP_ADMIN_GITHUB_LOGINS` for the first admin.
- `DATABASE_URL` with TLS; back it up (certificates and ledgers live there).
- `TRUSTED_PROXIES` covers your load balancer and the web server, so per-IP limits see real clients.
- `DEV_LOGIN` unset on the web; don't build mobile with `DEV_LOGIN`.
- `GROQ_API_KEY` set if you want the helper; tune the `AI_*` limits to your Groq plan.
- Never run `seed -reset` against production.
- Container images: `ghcr.io/<owner>/stackstep-api` and `stackstep-web` (see `docs/RELEASING.md`).

## 11. CI and release settings

CI needs no secrets: tests use a throwaway Postgres and the fake Groq server.

Release builds read repository **variables** `MOBILE_API_BASE_URL`, `WEB_BASE_URL`,
`WEB_CONSOLE_URL`, and optional signing **secrets** for Android
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`) and iOS (`IOS_P12_BASE64`, `IOS_P12_PASSWORD`,
`IOS_PROVISIONING_PROFILE_BASE64`, `IOS_TEAM_ID`). Details: [`docs/RELEASING.md`](RELEASING.md).

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| API exits listing config errors | Fix each listed variable; in production all secrets and GitHub OAuth are required. |
| "Developer sign-in" missing | Set `DEV_LOGIN=true` for the web and keep `APP_ENV` non-production. |
| Live chat never connects | `PUBLIC_WS_URL` must reach the API and its origin must be in `ALLOWED_ORIGINS`. |
| Everyone hits "Too many attempts" behind a proxy | Add the proxy's CIDR to `TRUSTED_PROXIES`. |
| AI helper says "not set up yet" | Set `GROQ_API_KEY` and restart the API. |
| AI answers fail with "busy" | Groq rate limit or outage; lower student load or raise your Groq plan, and keep `AI_GLOBAL_PER_MINUTE` under its limit. Credits are refunded. |
| Certificate links from the app open the wrong site | Build the app with `--dart-define=WEB_BASE_URL=<web URL>`. |
