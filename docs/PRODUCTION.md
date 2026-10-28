# Going to production, step by step

This guide takes Stackstep from this repository to real users. Follow the steps in order: each
one gives you a value (a URL or a secret) that a later step needs.

**The pieces:**

| Piece | Runs on | Talks to |
|---|---|---|
| Database (Postgres) | Neon | — |
| API (Go) | Render (Docker) | the database, GitHub, Groq |
| Web app (Next.js) | Vercel | the API, through its own `/api/...` proxy |
| Mobile app (Flutter) | phones (APK / App Store) | the API directly |

Browsers only ever talk to the web app's domain. The web app forwards `/api/v1/...` to the API.
That keeps the sign-in cookie on one domain and means the API needs no CORS for normal requests.
The live chat connection (WebSocket) goes straight from the browser to the API, which is why the
API needs to know the web app's address (`ALLOWED_ORIGINS`).

Keep a notes file open while you work. You'll collect:

```
NEON_DIRECT_URL      = postgresql://...        (step 1)
API_URL              = https://<name>.onrender.com   (step 3)
WEB_URL              = https://<name>.vercel.app     (step 4)
GITHUB_CLIENT_ID     = ...                       (step 2)
GITHUB_CLIENT_SECRET = ...                       (step 2)
JWT_SECRET           = 64 random characters      (step 0)
OAUTH_STATE_SECRET   = 64 random characters      (step 0)
PROXY_SHARED_SECRET  = 64 random characters      (step 0)
GROQ_API_KEY         = gsk_...                   (optional, step 3)
```

---

## Step 0 — Generate three secrets

Run this three times and keep each output. Each must be **different**:

```bash
openssl rand -hex 32
```

Use them for `JWT_SECRET`, `OAUTH_STATE_SECRET` and `PROXY_SHARED_SECRET`. Never commit them.
If one leaks, replace it. Changing `JWT_SECRET` signs everyone out, which is harmless.

---

## Step 1 — Database on Neon

1. Create a Neon project in a region close to your Render region (e.g. both in Singapore or
   both in US East).
2. Open **Connection details** and turn **Connection pooling OFF**. Copy that string: it's the
   **direct** URL, and the host has no `-pooler` in it.
   - Why: the API listens for database notifications to push live chat, and Neon's pooler
     doesn't support that. With a pooled URL, chat only updates after a refresh, and the
     "Reconnecting…" banner keeps coming back.
3. Make sure it ends with `?sslmode=require`. Remove `&channel_binding=require` if it's there.
4. Save it as `NEON_DIRECT_URL`.

You don't need to create tables: the API creates and upgrades them every time it starts.

> If you shared your Neon password anywhere (chat, screenshots), reset it now under
> **Roles → Reset password**, and use the new URL everywhere below.

---

## Step 2 — GitHub sign-in (OAuth app)

Students and admins sign in with GitHub, and there's no password login in production.

1. On GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Create it
   under your organisation if you have one, so it doesn't depend on one person.
2. Fill in:
   - **Application name**: Stackstep
   - **Homepage URL**: your web URL. Use a placeholder like `https://stackstep.vercel.app`
     for now and fix it after step 4.
   - **Authorization callback URL**: `<WEB_URL>/api/v1/auth/github/callback`
     (e.g. `https://stackstep.vercel.app/api/v1/auth/github/callback`).
3. Create it, then **Generate a new client secret**. Save `GITHUB_CLIENT_ID` and
   `GITHUB_CLIENT_SECRET`.

The mobile app uses the **same** OAuth app and callback URL. After GitHub returns to the web
URL, the API sends phones back into the app (`stackstep://auth`). You don't register a second
callback.

---

## Step 3 — API on Render

1. Render → **New → Web Service** → connect this GitHub repository.
2. Settings:
   - **Language/Runtime**: Docker
   - **Root directory**: `backend`
   - **Dockerfile path**: `./Dockerfile` (inside `backend`)
   - **Branch**: `main`
   - **Health check path**: `/readyz`
   - **Instance type**: the free tier sleeps when idle (the first request takes ~50 s and live
     chat drops). Use at least the smallest paid instance for real students.
3. **Environment variables** (Render → your service → Environment):

| Variable | Value | Notes |
|---|---|---|
| `APP_ENV` | `production` | Turns off dev login and enforces the checks below |
| `HTTP_ADDR` | `:10000` | Render sends traffic to port 10000. The API reads `HTTP_ADDR`, **not** `PORT` |
| `DATABASE_URL` | `NEON_DIRECT_URL` | The direct (non-pooler) URL |
| `JWT_SECRET` | from step 0 | ≥ 32 characters |
| `OAUTH_STATE_SECRET` | from step 0 | ≥ 32 characters, different from `JWT_SECRET` |
| `GITHUB_CLIENT_ID` | from step 2 | Required in production |
| `GITHUB_CLIENT_SECRET` | from step 2 | Required in production |
| `GITHUB_REDIRECT_URL` | `<WEB_URL>/api/v1/auth/github/callback` | Exactly the callback URL from step 2 |
| `WEB_BASE_URL` | `<WEB_URL>` | Where sign-in sends people afterwards; used for certificate links |
| `ALLOWED_ORIGINS` | `<WEB_URL>` | Exact origin: `https://`, no trailing slash. Comma-separate extra domains (e.g. a custom domain) |
| `PROXY_SHARED_SECRET` | from step 0 | Same value as on Vercel. Rate limits then count each student instead of the proxy |
| `BOOTSTRAP_ADMIN_GITHUB_LOGINS` | your GitHub username | Optional; this account becomes admin on first sign-in. Or use the workflow in step 6 |
| `GROQ_API_KEY` | `gsk_...` | Optional. Turns on the AI helper, the AI team lead and AI review drafts. Without it the helper shows "not available", the team lead uses scripted replies and reviews are manual |

   Optional tuning (sensible defaults, leave them out unless needed): `GROQ_MODEL`,
   `AI_DAILY_QUESTIONS` (8), `AI_QUESTION_COOLDOWN` (2m), `AI_FOLLOWUP_COOLDOWN` (5m),
   `AI_MAX_FOLLOWUPS` (3), `AI_GLOBAL_PER_MINUTE` (30), `AI_TEAM_LEAD` (on), `AI_LEAD_PER_MINUTE` (20),
   `AI_REVIEW_DRAFTS` (on), `AI_REVIEW_DRAFTS_PER_DAY` (60), `GITHUB_TOKEN` (empty), `LEAD_REPLY_DELAY` (45s),
   `AUTH_RATE_PER_MINUTE` (30), `MOBILE_REDIRECT_URL` (`stackstep://auth`). Every setting is
   listed in [`SETUP.md`](SETUP.md).

4. Deploy. In **Logs** you should see migrations run and then the server listening. Open
   `<API_URL>/readyz`. It should say `{"status":"ready"}`. A 404 on `/` is normal: the API has
   no home page. "shutting down" lines during a deploy are the old instance stopping.
5. Save the service URL as `API_URL`.

If the API won't start, the log names the bad variable (e.g. "JWT_SECRET must be at least 32
bytes", "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required in production").

---

## Step 4 — Web app on Vercel

1. Vercel → **Add New → Project** → import this repository.
2. Settings:
   - **Root directory**: `web`
   - **Framework**: Next.js (auto-detected). Leave the build and install commands as they are.
     Vercel uses pnpm from `package.json`.
   - **Node.js version**: 22.x or newer
3. **Environment variables** (Project → Settings → Environment Variables, for *Production*):

| Variable | Value | Visibility | Notes |
|---|---|---|---|
| `API_INTERNAL_URL` | `<API_URL>` | Secret | Where the web app's proxy sends `/api/v1/...` |
| `PUBLIC_WS_URL` | `wss://<api-host>/v1/ws` | **Config / Plain** (not secret) | e.g. `wss://stackstep-api.onrender.com/v1/ws`. Note `wss://` and `/v1/ws` |
| `PROXY_SHARED_SECRET` | from step 0 | Secret | Same value as on Render |

   `PUBLIC_WS_URL` can't be marked "secret" in Vercel: names starting with `PUBLIC_` must be
   "config". That's fine, because it's a public address.

4. Deploy, then save the production URL as `WEB_URL`.
5. **Go back and fix the URLs** now that you know the real `WEB_URL`:
   - GitHub OAuth app: Homepage URL and callback URL.
   - Render: `GITHUB_REDIRECT_URL`, `WEB_BASE_URL`, `ALLOWED_ORIGINS`, then redeploy.

### Custom domain (optional)

If you add `stackstep.yourcollege.in` on Vercel, it becomes your `WEB_URL`:
- add it to `ALLOWED_ORIGINS` (comma-separated, keep the vercel.app one if you still use it)
- set `WEB_BASE_URL` and `GITHUB_REDIRECT_URL` to the new domain
- update the GitHub OAuth app's callback URL

For a custom API domain (e.g. `api.stackstep.in` on Render), update `API_INTERNAL_URL`,
`PUBLIC_WS_URL` and the mobile `MOBILE_API_BASE_URL` (step 7).

---

## Step 5 — GitHub repository setup

Do these once in the repository on GitHub.

1. **Default branch and merges.** Open a pull request from `claude/confident-brown-s2gp0m` to
   `main` and **squash-merge** it. PR titles must be Conventional Commits (`feat: …`,
   `fix: …`); the `PR title` check enforces it.
2. **Actions permissions.** Settings → Actions → General → Workflow permissions:
   - choose **Read and write permissions**
   - tick **Allow GitHub Actions to create and approve pull requests** (release-please needs it
     for versioned releases)
3. **Production environment** (for the database workflows): Settings → Environments → **New
   environment** → `production`.
   - Add the secret **`DATABASE_URL`** = `NEON_DIRECT_URL`.
   - Recommended: under **Deployment protection rules**, add yourself as a **Required
     reviewer**, so a flush can't run without your approval.
4. **Repository variables** (Settings → Secrets and variables → Actions → **Variables**). These
   go into the mobile builds:

| Variable | Value |
|---|---|
| `MOBILE_API_BASE_URL` | `<API_URL>` (the Render URL, not the web URL) |
| `WEB_BASE_URL` | `<WEB_URL>` |
| `WEB_CONSOLE_URL` | `<WEB_URL>/admin` |

5. **Repository secrets** for signed mobile builds (optional; without them you get a
   debug-signed APK and an unsigned iOS build):

| Secret | What |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload-keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | From `keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload` |
| `IOS_P12_BASE64`, `IOS_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_TEAM_ID` | From your Apple Developer account (distribution certificate and App Store profile) |

   Back up the Android keystore somewhere safe. If you lose it, you can't update the Play
   Store app.
6. **Optional:** enable code scanning (Settings → Code security) so CodeQL results show up.

What the workflows do:

| Workflow | When | What |
|---|---|---|
| Backend, Web, Mobile, E2E, API contract | Every PR and push to `main` | Lint, tests, builds |
| PR title | Every PR | Conventional Commit title |
| Release | Push to `main` | Builds APK/AAB, iOS, API binaries and Docker images (`latest-main` pre-release, or `vX.Y.Z` when you merge the release PR) |
| CodeQL | `main` and weekly | Security scan (never blocks) |
| **Database · seed admins** | By hand | Makes GitHub users admins on a deployed database |
| **Database · flush seeded data** | By hand | Removes demo data (or everything) from a deployed database |

Render and Vercel deploy on their own whenever `main` changes; no workflow is needed for that.

---

## Step 6 — Prepare the database: remove demo data, add your admins

If you loaded the demo seed (asha-dev, admin-demo, …) into Neon while testing, remove it first.

**Flush the demo data:** Actions → **Database · flush seeded data** → **Run workflow**:
- environment: `production`
- mode:
  - `demo` removes the demo accounts, their internships, the demo React flow, its tasks, the
    demo personas, the "ANITS Batch 1" cohort and the "ANITS" college. Your own accounts and
    data stay.
  - `all` empties every table except the list of programs and the default team lead "Sam
    Rivera". Use it for a clean start, or when `demo` refuses.
- confirm: type `FLUSH`

It runs in one transaction: either everything is removed or nothing is. If `demo` says "some
real data depends on demo data", a real student is on the demo flow or has tasks from
`admin-demo`. Either remove that data in the admin console first, or run `all`.

**Add your admins:** Actions → **Database · seed admins** → **Run workflow**:
- environment: `production`
- logins: your GitHub usernames, comma-separated (e.g. `mutcherlarahulkumar,teammate`)

Each run summary says, per login, `created` (they'll be linked on first GitHub sign-in),
`promoted` (an existing user became admin) or `already admin`. It creates nothing else: you set
up personas, the task library, flows, colleges and cohorts yourself from the admin console.

You can also run the same tool from a laptop:

```bash
cd backend
DATABASE_URL='<NEON_DIRECT_URL>' go run ./cmd/dbadmin admins -logins alice,bob
DATABASE_URL='<NEON_DIRECT_URL>' go run ./cmd/dbadmin flush -mode demo -confirm FLUSH
```

**Never run `make seed` against production.** It loads test fixtures for automated tests and
refuses `APP_ENV=production`, but it only checks the variable on your machine.

---

## Step 7 — Mobile app

The app reads three build-time settings. They're compiled in, so changing them needs a new build.

| Setting (`--dart-define`) | Value | Comes from |
|---|---|---|
| `API_BASE_URL` | `<API_URL>` | repo variable `MOBILE_API_BASE_URL` |
| `WEB_BASE_URL` | `<WEB_URL>` | repo variable `WEB_BASE_URL` |
| `WEB_CONSOLE_URL` | `<WEB_URL>/admin` | repo variable `WEB_CONSOLE_URL` |

There is no developer sign-in in the app; everyone uses GitHub.

**From GitHub (recommended):** after step 5, every push to `main` builds the app with those
variables. Download the APK/AAB from **Releases → latest-main** (or `vX.Y.Z`). Upload the AAB to
the Play Console; install the APK directly to test.

**By hand:**

```bash
cd mobile
flutter build apk --release \
  --dart-define=API_BASE_URL=https://stackstep-api.onrender.com \
  --dart-define=WEB_BASE_URL=https://stackstep.vercel.app \
  --dart-define=WEB_CONSOLE_URL=https://stackstep.vercel.app/admin
```

Android package id: `app.stackstep.stackstep`. Sign-in returns through `stackstep://auth`,
which is already registered in the Android and iOS projects.

---

## Step 8 — Smoke test (10 minutes)

1. Open `<WEB_URL>`. **Continue with GitHub** → authorise → accept the privacy notice →
   you land on the admin console (if your login is an admin).
2. **People** → add a college and a cohort → enroll a test GitHub account you control.
3. **Personas** → add your managers. **Task library** → add a task. **Flows** → build a flow
   and publish it.
4. Sign in as the test student in a private window: consent → the first-run guide → the team
   lead's welcome in chat.
5. Assign a task from the admin console. It appears on the student's board **without a
   refresh**. If it only shows after a refresh, see Troubleshooting.
6. Hand it in as the student → **Reviews** shows it → approve.
7. Install the APK, sign in with GitHub, and check the same chat and board.
8. If you set `GROQ_API_KEY`: ask the AI helper a question as the student, send the Team Lead
   a message (the reply says "Automatic reply"), and as admin open Reviews → **Draft with AI**.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Reconnecting…" banner keeps coming back | 1) `PUBLIC_WS_URL` must be `wss://<api-host>/v1/ws`. 2) `ALLOWED_ORIGINS` must exactly equal the web origin (`https://…`, no slash). 3) `DATABASE_URL` must be the **direct** Neon URL. 4) Free Render instances sleep; use a paid instance. The browser console logs the close code. |
| GitHub says "redirect_uri is not associated" | `GITHUB_REDIRECT_URL` on Render differs from the OAuth app's callback URL. They must match exactly. |
| After GitHub, "sign-in didn't complete" | `WEB_BASE_URL` points somewhere else, or the browser blocked the cookie. Use the same domain throughout. |
| "Too many attempts" for many students at once | Set `PROXY_SHARED_SECRET` to the same value on Render and Vercel. |
| Web shows "API unavailable" | `API_INTERNAL_URL` is wrong, or the API is asleep or crashing (check Render logs). |
| App says it can't reach Stackstep | `MOBILE_API_BASE_URL` was wrong when the app was built. Fix the variable and rebuild. |
| AI helper says it's not available | `GROQ_API_KEY` is missing or invalid on Render. |
| Flush workflow fails "Add a DATABASE_URL secret" | Add the secret to the **environment** (`production`), not only to the repository. |

## Production checklist

- [ ] Neon: **direct** URL, `sslmode=require`, password rotated if it was ever shared
- [ ] Render: `APP_ENV=production`, `HTTP_ADDR=:10000`, all secrets ≥ 32 chars and different
- [ ] Render: `ALLOWED_ORIGINS`, `WEB_BASE_URL` and `GITHUB_REDIRECT_URL` use the final web domain
- [ ] Vercel: `API_INTERNAL_URL`, `PUBLIC_WS_URL` (wss), `PROXY_SHARED_SECRET`
- [ ] GitHub OAuth app callback = `<WEB_URL>/api/v1/auth/github/callback`
- [ ] GitHub: `production` environment with `DATABASE_URL`, required reviewer on it
- [ ] GitHub: repo variables for the mobile build; signing secrets if publishing to stores
- [ ] Demo data flushed; admins seeded; smoke test passed
- [ ] A paid Render instance (no sleeping) before students start
