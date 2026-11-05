package curriculum

import "github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"

// Days 22 to 60 of the full-stack program. Week 4 hardens the two React projects (tests,
// CI, Git), weeks 5 and 6 build and deploy a Node and PostgreSQL API with auth and connect
// the task manager to it, and weeks 7 and 8 are a full-stack capstone plus interviews.
func fullstackRest() []Day {
	out := fullstackWeek4()
	out = append(out, backendWeeks()...)
	return append(out, capstoneWeeks()...)
}

func be(key, title string, dueDays int, brief string, resources []domain.Resource, rubric ...string) Item {
	return ticket(key, title, BackendLead, dueDays, brief, resources, rubric...)
}

var (
	express = link("Express routing guide", "https://expressjs.com/en/guide/routing.html")
	prisma  = link("Prisma getting started", "https://www.prisma.io/docs/getting-started")
	zod     = link("Zod documentation", "https://zod.dev")
)

func fullstackWeek4() []Day {
	return days(
		on(22,
			standup("fs-w4-kickoff", "Week four kickoff",
				`This week you make your two React apps production-grade, with tests, CI and a clean Git history. Next week the backend starts.

### Tell the team
- Links to your three live projects
- The part of your code you trust least, and why
- Whether you have used a terminal-based Git workflow beyond add, commit and push`),
			testingTicket(),
			dsaReverseList(),
		),
		on(23,
			chore("fs-rebase", "Rebase a branch and resolve a merge conflict",
				`Conflicts are normal on a team. Learn to handle them calmly.

### Set up a conflict on purpose (in the task manager repo)
1. From `+"`main`"+`, create `+"`chore/readme-a`"+` and change the README's first paragraph. Commit.
2. Go back to `+"`main`"+`, create `+"`chore/readme-b`"+` and change the **same** paragraph differently. Commit, push, open a PR and merge it.
3. Switch to `+"`chore/readme-a`"+` and rebase it onto the updated main.
   `+"```bash"+`
   git fetch origin
   git rebase origin/main
   `+"```"+`
4. Git stops with a conflict. Open the file, keep the right text, remove the markers, then `+"`git add`"+` it and `+"`git rebase --continue`"+`.
5. Use `+"`git rebase -i`"+` to squash any "fix typo" commits into a clean history.
6. Push with `+"`git push --force-with-lease`"+` (never plain `+"`--force`"+`) and open the PR.

### Hand in
The PR link. In the note, explain the difference between merge and rebase in your own words, and why `+"`--force-with-lease`"+` is safer.`,
				links(link("Git branching, rebasing", "https://git-scm.com/book/en/v2/Git-Branching-Rebasing"), link("Resolving a merge conflict on the command line", "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/resolving-a-merge-conflict-using-the-command-line"),
					link("Rewriting history", "https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History")),
				"Branch is rebased onto the latest main with the conflict resolved", "No conflict markers left in the file", "History is clean after interactive rebase",
				"Pushed with force-with-lease", "Explains merge versus rebase correctly"),
			dsaMergeLists(),
		),
		on(24,
			ticket("fs-test-p2", "Test Show Finder's data fetching with mocks", QALead, 2,
				`### Context
Tests that hit a real API are slow and flaky. Mock the network instead.

### What to build
- Mock Service Worker (MSW) handlers for the TVMaze search and show endpoints, used by Vitest
- Tests for the search page covering loading then results, no results, a server error with Retry, and the debounce (fake timers)
- A test for the details page's "not found" state
- A test that proves the race condition fix (a slow first response must not overwrite a fast second one)

### Acceptance criteria
- No real network requests during tests (MSW warns on unhandled requests, make that an error)
- Tests run in CI from yesterday's workflow
- Each test sets up its own handlers and resets them afterwards

### Hand in
The PR link from `+"`test/show-finder`"+`.`,
				links(link("Mock Service Worker docs", "https://mswjs.io/docs/"), link("Vitest fake timers", "https://vitest.dev/guide/mocking.html#timers"), link("React Testing Library intro", "https://testing-library.com/docs/react-testing-library/intro/")),
				"Network is mocked with MSW, unhandled requests fail", "Loading, results, empty and error are tested", "Debounce tested with fake timers",
				"A test guards the race condition fix", "Handlers reset between tests"),
			dsaMiddleNode(),
			popQuiz("fs-quiz-git", "Pop quiz on Git beyond the basics", DeliveryManager, "Five questions from yesterday's rebase exercise.", quiz(
				mcq("What does `git rebase origin/main` do to your branch?", 1, "Merges main into it with a merge commit", "Replays your commits on top of the latest main", "Deletes your commits", "Pushes your branch"),
				mcq("Why prefer `--force-with-lease` over `--force`?", 2, "It's faster", "It skips the hooks", "It refuses to overwrite commits on the remote you haven't seen", "It signs the commits"),
				mcq("Which command shows a compact history of all branches?", 0, "git log --oneline --graph --all", "git status -v", "git diff --stat", "git show HEAD"),
				mcq("You committed to the wrong branch and haven't pushed. A safe fix is", 3, "Delete the repo", "git push --force", "git reset --hard origin/main on every branch", "Create the right branch at this commit, then reset the wrong one back"),
				mcq("When is rebasing a shared branch a bad idea?", 1, "Never", "When other people have already based work on it", "When the branch is new", "When the tests pass"),
			)),
		),
		on(25,
			cicdTicket(),
			dsaClimbStairs(),
		),
		on(26,
			perfTicket(),
			dsaGenerateParens(),
		),
		on(27,
			bug("fs-bug-missing-data", "Show Finder crashes on shows with missing data",
				`### Bug report
**Reported by** monitoring. The details page goes blank for some shows.

> Open a very old or obscure show, for example one with no network, no rating and no image. The page is white and the console says "Cannot read properties of null".

### Expected
Any show from the API renders. Missing fields show a sensible fallback ("Rating not available", a placeholder poster, no empty "Network" row).

### What to do
1. Find two real show ids that reproduce it (search for very old shows).
2. Add a failing test with a mocked response that has the missing fields.
3. Fix the components with optional chaining and fallbacks, and add an error boundary around the details page so one bad field can never blank the whole app.

### Hand in
A PR from `+"`fix/missing-show-data`"+`.`,
				links(link("Optional chaining", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining"), link("Catching rendering errors with an error boundary", "https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary")),
				"Bug reproduced with real ids", "A failing test was added first", "Missing fields render fallbacks", "An error boundary protects the details page"),
			dsaPermutations(),
		),
		on(28,
			blog("fs-blog-testing", "What tests and CI changed in how I work",
				`### Write about
- Your testing setup and one test you're proud of
- A bug your tests caught before a user did
- How CI and branch protection changed your workflow

400 to 800 words, with a snippet and a screenshot of a CI run.

### Hand in
The link to the published post.`,
				"Published with repo links", "Describes a real bug caught by tests", "Explains the CI setup clearly", "Includes a snippet and CI screenshot"),
			standup("fs-w4-retro", "Week four retro",
				`### Answer in three short parts
- **Went well**
- **Was hard**
- **Next week** you'll try differently

Next week is backend. Write down three questions you have about how servers and databases work.`),
			dsaSubsets(),
		),
	)
}

func backendWeeks() []Day {
	return days(
		on(29,
			standup("be-kickoff", "Backend kickoff",
				`For two weeks you build **Tasks API**, the backend for your task manager, with Node.js, Express and PostgreSQL. Then you connect the React app to it.

### Tell the team
- Your three questions from last week's retro
- Whether you have written SQL before
- What you think happens between a click and data being saved`),
			be("be-setup", "Set up the Tasks API with Node and Express", 1,
				`### What to build
- A new repo `+"`tasks-api`"+` with Node LTS, Express and ES modules (`+"`\"type\": \"module\"`"+`)
- `+"`GET /health`"+` returning `+"`{ \"status\": \"ok\" }`"+`
- A clear structure, for example `+"`src/app.js`"+` (the Express app), `+"`src/server.js`"+` (starts listening), `+"`src/routes/`"+` and `+"`src/middleware/`"+`
- Config from environment variables (`+"`PORT`"+`), with a `+"`.env.example`"+` and `+"`.env`"+` in `+"`.gitignore`"+`
- `+"`npm run dev`"+` with file watching (`+"`node --watch`"+`) and ESLint
- JSON body parsing and a 404 handler that returns JSON, not HTML

### Acceptance criteria
- `+"`app.js`"+` exports the app without starting it, so tests can import it later
- No secrets are committed
- The README explains how to run it

### Hand in
The PR link from `+"`feat/setup`"+`.`,
				links(link("Installing Express", "https://expressjs.com/en/starter/installing.html"), express, link("The Twelve-Factor App, config", "https://12factor.net/config")),
				"Health endpoint returns JSON", "App and server are separated", "Config comes from env vars with an example file", "Unknown routes return a JSON 404", "README has run steps"),
			reading("be-rest", "Designing a REST API",
				`### Read
The MDN pages on HTTP methods and status codes again, this time from the server's side, and skim the Express routing guide.

### Then design Tasks API on paper, in your notes
For each endpoint write the method, path, request body, success status and response body, and the errors it can return. Cover listing, reading one, creating, updating, deleting and marking done. Use plural nouns (`+"`/tasks`"+`), not verbs (`+"`/getTasks`"+`).`,
				links(link("HTTP request methods", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods"), link("HTTP response status codes", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status"), express)),
			dsaMaxDepth(),
		),
		on(30,
			be("be-crud", "Build the tasks CRUD endpoints with validation", 2,
				`### What to build
Endpoints, with tasks kept in memory for now.
- `+"`GET /tasks`"+` lists tasks
- `+"`GET /tasks/:id`"+` returns one task, or 404
- `+"`POST /tasks`"+` creates one and returns 201 with the task and a `+"`Location`"+` header
- `+"`PATCH /tasks/:id`"+` updates title, priority or done
- `+"`DELETE /tasks/:id`"+` returns 204

### Rules
- Validate every body with **Zod**. Invalid input returns 400 with which fields are wrong.
- Titles are 1 to 200 characters after trimming, priority is low, medium or high
- Unknown fields are rejected
- Ids are UUIDs, a malformed id returns 400, a missing one 404

### Acceptance criteria
- Correct status codes everywhere (check with curl or an HTTP client)
- One error response shape for every error, for example `+"`{ \"error\": { \"code\": \"validation_failed\", \"fields\": {...} } }`"+`
- Route handlers stay thin, logic lives in a small service module

### Hand in
The PR link from `+"`feat/tasks-crud`"+`. Include curl commands for every endpoint in the description.`,
				links(express, zod, link("HTTP response status codes", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status")),
				"All five endpoints work with correct status codes", "Bodies validated with Zod, unknown fields rejected", "One consistent error shape", "Malformed versus missing ids handled",
				"Thin handlers with logic in a service", "curl examples in the PR"),
			dsaInvertTree(),
			popQuiz("be-quiz-rest", "Pop quiz on REST API design", BackendLead, "Five questions on designing endpoints.", quiz(
				mcq("Which is the most RESTful way to delete task 42?", 2, "POST /deleteTask?id=42", "GET /tasks/42/delete", "DELETE /tasks/42", "PUT /tasks/delete/42"),
				mcq("A client sends a body that fails validation. Which status fits best?", 0, "400 Bad Request", "500 Internal Server Error", "404 Not Found", "200 OK with an error field"),
				mcq("What's the difference between PUT and PATCH?", 1, "None", "PUT replaces the resource, PATCH changes some fields", "PATCH creates, PUT deletes", "PUT is only for files"),
				mcq("Which status should a successful DELETE with no body return?", 3, "200 with \"ok\"", "201", "202", "204"),
				mcq("Why should handlers be thin?", 2, "Express requires it", "It makes them faster", "Logic in services can be tested and reused without HTTP", "It hides errors"),
			)),
		),
		on(31,
			be("be-db", "Store tasks in PostgreSQL with Prisma", 2,
				`### What to build
- A free PostgreSQL database (Neon or Supabase) and a local one for development (Docker or a second Neon branch)
- Prisma with a `+"`Task`"+` model (id as UUID, title, priority as an enum, done, createdAt, updatedAt)
- A first migration, committed, created with `+"`npx prisma migrate dev`"+`
- Replace the in-memory store with Prisma calls in your service module
- A seed script that inserts a few example tasks

### Acceptance criteria
- `+"`DATABASE_URL`"+` comes from the environment, never from code
- Migrations are in the repo and run from a clean database
- Updating or deleting a missing task still returns 404 (handle Prisma's not-found error)

### Hand in
The PR link from `+"`feat/postgres`"+`.`,
				links(prisma, link("Prisma migrate", "https://www.prisma.io/docs/orm/prisma-migrate"), link("Neon docs", "https://neon.tech/docs/introduction")),
				"Task model with UUID id, enum priority and timestamps", "Migration committed and reproducible", "DATABASE_URL from env", "Not-found still returns 404", "Seed script works"),
			reading("be-sql", "SQL you'll use every day",
				`Prisma writes SQL for you, but you need to read it.

### Read
The SQLBolt lessons 1 to 12, then the PostgreSQL page on indexes.

### In your notes, write the SQL for
1. All of a user's unfinished tasks, newest first
2. The number of tasks per priority
3. Marking every task of a user done in one statement
4. Which column you'd index for query 1, and why`,
				links(link("SQLBolt interactive lessons", "https://sqlbolt.com"), link("PostgreSQL indexes", "https://www.postgresql.org/docs/current/indexes.html"), link("Use The Index, Luke", "https://use-the-index-luke.com"))),
			dsaSymmetric(),
		),
		on(32,
			be("be-query", "Add pagination, filtering and sorting", 1,
				`### What to build
`+"`GET /tasks`"+` accepts query parameters.
- `+"`done=true|false`"+`, `+"`priority=low|medium|high`"+` and `+"`q`"+` (case-insensitive title search)
- `+"`sort=createdAt|-createdAt|priority`"+`
- Cursor pagination with `+"`limit`"+` (1 to 100, default 20) and `+"`cursor`"+`. The response includes `+"`items`"+` and `+"`nextCursor`"+` (null on the last page).

### Acceptance criteria
- Invalid query values return 400 with a clear message
- Pages never repeat or skip items when sorting by created time
- An index supports the most common query (add it in a migration)

### Hand in
The PR link from `+"`feat/query`"+`. Explain in the description why cursor pagination beats page numbers for a live list.`,
				links(link("Prisma pagination", "https://www.prisma.io/docs/orm/prisma-client/queries/pagination"), link("PostgreSQL indexes", "https://www.postgresql.org/docs/current/indexes.html")),
				"Filters, search and sort work together", "Cursor pagination with nextCursor and limit bounds", "Invalid query values return 400", "An index backs the common query",
				"Explains cursor versus offset pagination"),
			dsaLevelOrder(),
			popQuiz("be-quiz-dbms", "Pop quiz on databases", ContentLead, "Five DBMS questions that come up in placements.", quiz(
				mcq("What does a primary key guarantee?", 1, "The column is indexed for text search", "Each row is uniquely identified and the value is not null", "The column is encrypted", "Rows are sorted"),
				mcq("Which normal form removes repeating groups (one value per cell)?", 0, "First normal form", "Second normal form", "Third normal form", "BCNF"),
				mcq("An index on `tasks(user_id)` mainly speeds up", 2, "Inserts", "Deletes of the whole table", "Queries filtering by user_id", "Backups"),
				mcq("What does a foreign key enforce?", 3, "Unique values", "Fast joins", "Column type", "That a referenced row exists"),
				mcq("Which SQL clause filters groups after GROUP BY?", 1, "WHERE", "HAVING", "ORDER BY", "LIMIT"),
			)),
		),
		on(33,
			be("be-auth", "Sign up and log in with hashed passwords", 2,
				`### What to build
- A `+"`User`"+` model (id, email unique and lowercased, passwordHash, createdAt) and a migration giving each task a `+"`userId`"+`
- `+"`POST /auth/signup`"+` and `+"`POST /auth/login`"+`. Passwords are hashed with **bcrypt** (cost 12) or argon2.
- On login, issue a signed JWT that expires in 15 minutes, sent as an **httpOnly, Secure, SameSite=Lax cookie**
- `+"`POST /auth/logout`"+` clears the cookie and `+"`GET /auth/me`"+` returns the current user
- An `+"`auth`"+` middleware that protects every `+"`/tasks`"+` route

### Rules
- Never store or log plain passwords
- Login errors don't reveal whether the email exists ("Wrong email or password")
- Passwords need at least 10 characters
- The JWT secret comes from the environment

### Hand in
The PR link from `+"`feat/auth`"+`.`,
				links(link("Password storage cheat sheet (OWASP)", "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html"), link("Authentication cheat sheet (OWASP)", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"),
					link("Introduction to JSON Web Tokens", "https://jwt.io/introduction"), link("Using HTTP cookies", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies")),
				"Passwords hashed with bcrypt or argon2, never logged", "JWT in an httpOnly, Secure, SameSite cookie with short expiry", "Middleware protects task routes",
				"Login errors don't reveal which part was wrong", "Secrets come from env"),
			reading("be-owasp", "The OWASP Top 10 for API developers",
				`### Read
The OWASP Top 10 overview and the API Security Top 10 summary.

### In your notes, for Tasks API
Pick the five risks most relevant to your API. For each, write one way it could happen in your code and how you prevent it.`,
				links(link("OWASP Top 10", "https://owasp.org/www-project-top-ten/"), link("OWASP API Security Top 10", "https://owasp.org/API-Security/"))),
			dsaValidBST(),
		),
		on(34,
			bug("be-bug-idor", "Users can read and change other users' tasks",
				`### Security report
**Severity** high. **Reported by** an internal security review.

> Logged in as alice, I called GET /tasks/<id of one of bob's tasks> and got it back. PATCH and DELETE on bob's task also worked.

This is an Insecure Direct Object Reference (IDOR), one of the most common API vulnerabilities.

### Expected
A user can only see and change their own tasks. Someone else's task id behaves exactly like a missing one (404, so ids can't be probed).

### What to do
1. Write a test that signs up two users and proves the bug.
2. Fix it by scoping every query by the logged-in user (`+"`where: { id, userId }`"+`), not by checking afterwards.
3. Check list, read, update and delete.

### Hand in
A PR from `+"`fix/task-ownership`"+` with the test.`,
				links(link("OWASP API1, broken object level authorization", "https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/")),
				"A test with two users reproduces the bug", "Every query is scoped by userId", "Other users' tasks return 404", "List, read, update and delete are all covered"),
			dsaKthSmallest(),
		),
		on(35,
			blog("be-blog", "How I designed my first REST API",
				`### Write about
- Your endpoints and the status codes you chose
- How you validate input and shape errors
- What the IDOR bug taught you about authorization

500 to 900 words, with request and response examples.

### Hand in
The link to the published post.`,
				"Published with a repo link", "Endpoints and status codes justified", "Explains validation and error shape", "Explains the IDOR fix clearly"),
			standup("be-w5-retro", "Week five retro",
				`### Answer in three short parts
- **Went well**
- **Was hard**
- **Next week** you'll try differently

Which of your three backend questions can you answer now?`),
		),
		on(36,
			standup("be-w6-kickoff", "Week six kickoff",
				`This week the API becomes production-ready (errors, logs, tests, docs, deploy), and your task manager starts using it.

### Tell the team
- Your API's open PRs and anything blocking them
- One thing about the backend that still feels like magic`),
			be("be-errors", "Consistent errors, request logs and rate limits", 1,
				`### What to build
- One error-handling middleware at the end of the chain. Known errors (validation, not found, auth) map to the right status, unknown ones become a 500 with a request id and no stack trace in the response.
- A request id on every request (header `+"`X-Request-Id`"+`), included in logs and error responses
- Structured JSON logs with method, path, status, duration and request id (pino or similar). Never log passwords, tokens or cookies.
- Rate limiting with express-rate-limit, strict on `+"`/auth/*`"+` (for example 10 per minute per IP), looser elsewhere, returning 429 with `+"`Retry-After`"+`
- Security headers with helmet

### Hand in
The PR link from `+"`feat/hardening`"+`.`,
				links(link("Express error handling", "https://expressjs.com/en/guide/error-handling.html"), link("express-rate-limit", "https://www.npmjs.com/package/express-rate-limit"), link("Helmet", "https://helmetjs.github.io")),
				"Central error middleware with safe 500s", "Request id in logs and responses", "Structured logs with no secrets", "Rate limits with 429 and Retry-After", "Helmet enabled"),
			dsaKthLargest(),
		),
		on(37,
			ticket("be-tests", "Test the API with Supertest", QALead, 2,
				`### What to build
- Vitest (or Jest) with Supertest, running against a **separate test database**
- Each test file resets the tables it uses, so tests are independent
- Tests for signup and login (including wrong password and duplicate email), every task endpoint (happy path and errors), pagination and the IDOR rule
- The tests run in GitHub Actions with a PostgreSQL service container

### Acceptance criteria
- `+"`npm test`"+` passes from a clean clone with only `+"`DATABASE_URL`"+` set
- At least 20 tests, none depending on another's data
- CI is required on `+"`main`"+`

### Hand in
The PR link from `+"`test/api`"+`.`,
				links(link("Supertest", "https://github.com/ladjs/supertest"), link("Vitest getting started", "https://vitest.dev/guide/"),
					link("PostgreSQL service containers in Actions", "https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers")),
				"Separate test database, reset per file", "Auth, CRUD, pagination and ownership are tested", "At least 20 independent tests", "Runs in CI with a Postgres service"),
			dsaLastStone(),
			popQuiz("be-quiz-os", "Pop quiz on OS and networks", ContentLead, "Five CS fundamentals questions.", quiz(
				mcq("Node.js handles many connections on one thread mainly because of", 1, "Multiple CPUs", "Non-blocking I/O and an event loop", "Green threads", "Garbage collection"),
				mcq("Which layer does TCP belong to?", 2, "Application", "Network", "Transport", "Physical"),
				mcq("What is a deadlock?", 0, "Two or more processes each waiting for a resource another holds", "A crashed process", "A slow database", "An infinite loop"),
				mcq("What happens in a TLS handshake?", 3, "The server sends HTML", "DNS is resolved", "Cookies are set", "Client and server agree on keys and the server proves its identity"),
				mcq("Which is stored on the stack rather than the heap, typically?", 1, "Objects created with new", "Local primitive variables and return addresses", "Global caches", "Files"),
			)),
		),
		on(38,
			be("be-docs", "Document the API with OpenAPI", 1,
				`### What to build
- An `+"`openapi.yaml`"+` describing every endpoint, request body, response and error, with examples
- Swagger UI served at `+"`/docs`"+` in development
- The README links to the docs and shows a quick-start with curl

### Acceptance criteria
- The spec validates (use the Swagger Editor)
- Auth is described as a cookie security scheme
- Every error status the API can return is documented

### Hand in
The PR link from `+"`docs/openapi`"+`.`,
				links(link("OpenAPI specification", "https://swagger.io/specification/"), link("Swagger Editor", "https://editor.swagger.io"), link("swagger-ui-express", "https://www.npmjs.com/package/swagger-ui-express")),
				"Every endpoint, body and error documented", "Spec validates", "Cookie auth scheme described", "Docs served at /docs and linked from the README"),
			review("be-review-security", "Review an API handler for security holes",
				`A teammate opened this PR. Review it like a security-minded senior.

### Set up
Add the file below as `+"`src/review/searchUsers.js`"+` on a branch `+"`review/search-users`"+`, open a PR and review it with inline comments.

`+"```js"+`
import { pool } from "../db.js";

export async function searchUsers(req, res) {
  const q = req.query.q;
  const rows = await pool.query(
    "SELECT * FROM users WHERE email LIKE '%" + q + "%'"
  );
  console.log("search", q, req.headers.cookie);
  res.json(rows.rows);
}
`+"```"+`

### Find and explain at least four problems
Think about injection, what data is returned, logging, missing auth, input limits and error handling. Suggest a fix for each.

### Hand in
The PR link with your review.`,
				"Identifies the SQL injection and suggests parameterised queries", "Notes that SELECT * leaks password hashes", "Flags logging cookies",
				"Notes missing auth, input limits and error handling", "Each comment explains impact and a fix"),
			dsaKClosest(),
		),
		on(39,
			be("be-deploy", "Deploy the API with a managed PostgreSQL", 1,
				`### What to do
1. Create a production database (Neon or Supabase) separate from development.
2. Deploy the API to Render (or Railway or Fly) from GitHub, with environment variables for the database URL, JWT secret and allowed origin.
3. Run migrations as part of the deploy (`+"`npx prisma migrate deploy`"+`).
4. Point the health check at `+"`/health`"+`.
5. Check it with curl from your machine, including signup, login and a protected route.

### Acceptance criteria
- No secrets in the repo or in logs
- Migrations run automatically on deploy
- The README has the live API URL and the docs link

### Hand in
The PR that adds the deploy configuration (or README update). Put the live URL in the note.`,
				links(link("Deploy a Node Express app on Render", "https://render.com/docs/deploy-node-express-app"), link("Prisma migrate deploy", "https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate"),
					link("The Twelve-Factor App", "https://12factor.net")),
				"API is live and passes a curl walkthrough", "Production database is separate", "Migrations run on deploy", "No secrets committed", "README has the live URL"),
			reading("be-12factor", "The Twelve-Factor App",
				`### Read
Factors I to VI and XI (logs) of the Twelve-Factor App.

### In your notes
For each of those factors, one sentence on whether Tasks API follows it and, if not, what you'd change.`,
				links(link("The Twelve-Factor App", "https://12factor.net"))),
			dsaMergeKSorted(),
		),
		on(40,
			ticket("be-connect", "Connect the task manager to your API", DeliveryManager, 2,
				`### Context
Your React task manager still uses localStorage. Make it a real full-stack app.

### What to build
- Sign up, log in and log out screens in the task manager
- All task operations go through the API (`+"`fetch`"+` with `+"`credentials: \"include\"`"+`)
- Optimistic updates for toggling and deleting, rolled back with a message if the request fails
- Loading, empty and error states for every request
- A small `+"`api.js`"+` client module so components never call fetch directly

### Acceptance criteria
- Refreshing keeps you logged in (the cookie) and your tasks (the database)
- Two different accounts see different tasks
- Works against the deployed API from the deployed frontend

### Hand in
The PR link in the task manager repo.`,
				links(link("Using the Fetch API, credentials", "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#including_credentials"), link("Updating arrays in state", "https://react.dev/learn/updating-arrays-in-state")),
				"Auth screens work against the API", "All task operations use the API through one client module", "Optimistic updates roll back on failure", "Every request has loading and error states",
				"Works deployed, with two accounts isolated"),
			dsaMeetingRooms(),
		),
		on(41,
			be("be-cors", "Cookies, CORS and expired sessions", 1,
				`### What to build
- CORS on the API that allows only your frontend's origin, with credentials
- Cookies set with the right `+"`SameSite`"+` and `+"`Secure`"+` for your setup (frontend and API on different domains need `+"`SameSite=None; Secure`"+`)
- When the token expires, the API returns 401 and the frontend sends the user to login with a "Your session expired" message, keeping the page they were on
- A refresh token (longer-lived, rotated on use, stored hashed) so active users aren't logged out every 15 minutes

### Hand in
The PR link (API and frontend changes can be two PRs, link both). Explain in the description what CORS protects and what it doesn't.`,
				links(link("Cross-Origin Resource Sharing (CORS)", "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS"), link("SameSite cookies explained", "https://web.dev/articles/samesite-cookies-explained"),
					link("Refresh tokens (OAuth)", "https://oauth.net/2/refresh-tokens/")),
				"CORS allows only the frontend origin with credentials", "Cookie flags match the deployment", "Expired sessions redirect to login with a message", "Refresh tokens rotate and are stored hashed",
				"Explains what CORS does and doesn't protect"),
			popQuiz("be-quiz-security", "Pop quiz on auth and security", BackendLead, "Five questions on what you built this week.", quiz(
				mcq("Why store a JWT in an httpOnly cookie rather than localStorage?", 1, "It's faster", "JavaScript, including injected scripts, can't read it", "It never expires", "Browsers require it"),
				mcq("What does bcrypt's cost factor control?", 0, "How slow, and so how expensive to brute force, each hash is", "The hash length", "The salt", "Which algorithm is used"),
				mcq("CORS mainly protects", 2, "Your server from all attacks", "Passwords in transit", "Users' browsers from other sites reading your API's responses", "Against SQL injection"),
				mcq("A user requests another user's task by id. What should the API return?", 3, "403 with the owner's name", "200 with the task", "500", "404, as if it doesn't exist"),
				mcq("Why rotate refresh tokens on every use?", 1, "To save storage", "So a stolen, reused token is detected", "Because JWTs can't be refreshed", "To make login faster"),
			)),
			dsaTopKFrequent(),
		),
		on(42,
			chore("be-release", "Tag a release with notes",
				`### Steps
1. Make sure `+"`main`"+` is green and deployed for both the API and the task manager.
2. Tag both repos with `+"`v1.0.0`"+` and create GitHub Releases with notes (features, fixes, how to run, the live links).
3. Use semantic versioning from now on. Write in the README what would count as a major, minor or patch change for your API.

### Hand in
The link to the API's release page.`,
				links(link("Managing releases in a repository", "https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository"), link("Semantic Versioning", "https://semver.org")),
				"Both repos have a v1.0.0 tag and release", "Release notes are clear and complete", "Semver policy explained in the README"),
			blog("be-blog-fullstack", "Connecting a React app to my own API",
				`### Write about
- The architecture (diagram welcome), React, the API, the database and where each is hosted
- How auth works end to end, cookies, CORS and expiry
- The hardest bug of the two weeks

600 to 1,000 words.

### Hand in
The link to the published post.`,
				"Published with live links", "Clear architecture explanation or diagram", "Explains auth end to end correctly", "Real debugging story"),
			standup("be-w6-retro", "Week six retro",
				`### Answer in three short parts
- **Went well**
- **Was hard**
- **Next week** you'll try differently

The capstone starts on Monday. Start thinking about which brief excites you.`),
		),
	)
}

func capstoneWeeks() []Day {
	return days(
		on(43,
			capstoneKickoff("fs-capstone-plan", true),
			dsaNumIslands(),
		),
		on(44,
			ticket("fs-cap-skeleton", "Capstone walking skeleton", DeliveryManager, 1,
				`### Goal
Before features, prove the whole pipeline works end to end.

### Deliverables
- Frontend and API repos (or one monorepo) with lint, tests and CI from day one
- Frontend deployed and showing data from the deployed API's health endpoint
- A production database connected, with migrations running on deploy
- README with the architecture and links

### Hand in
The PR link. Live URLs in the note.`,
				links(link("Walking skeleton", "https://wiki.c2.com/?WalkingSkeleton"), link("GitHub Actions documentation", "https://docs.github.com/en/actions")),
				"Frontend, API and database deployed and connected", "CI runs lint and tests on both", "Migrations run on deploy", "Architecture in the README"),
			dsaFloodFill(),
		),
		on(45,
			be("fs-cap-model", "Capstone data model and migrations", 1,
				`### Deliverables
- The Prisma schema for every entity in your plan, with relations, required fields, unique constraints and indexes for your main queries
- Migrations committed
- A seed script that creates a demo user with realistic data, so reviewers can try it straight away
- An entity diagram in the README (Prisma can generate one, or draw it)

### Hand in
The PR link.`,
				links(prisma, link("Prisma relations", "https://www.prisma.io/docs/orm/prisma-schema/data-model/relations")),
				"Schema covers every story with sensible relations", "Constraints and indexes match the queries", "Seed script with a demo account", "Diagram in the README"),
			dsaShortestPath(),
		),
		on(46,
			be("fs-cap-auth", "Capstone authentication end to end", 2,
				`Reuse what you built for Tasks API, improved by what you learned.

### Deliverables
- Signup, login, logout and session refresh
- Every route that touches user data is protected and scoped to the user (write the IDOR test first)
- Frontend auth screens with good errors, and protected routes that redirect to login and back

### Hand in
The PR link (or both, if two repos).`,
				links(link("Authentication cheat sheet (OWASP)", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html")),
				"Full auth flow works on the deployed app", "Ownership enforced in queries with tests", "Protected routes redirect and return correctly"),
			dsaCourseSchedule(),
		),
		on(47,
			capstoneBuild("fs-cap-core", "Capstone core feature",
				`### Goal
Ship the most important story end to end, API and UI. StudyBuddy's subjects and topics, SplitIt's groups and expenses, or Habitly's habits and check-ins.

### Expectations
- API validation and tests for the new endpoints
- UI with loading, empty and error states
- PRs link and close their issues

### Hand in
The main PR link for today.`),
			dsaComponents(),
		),
		on(48,
			capstoneBuild("fs-cap-second", "Capstone second feature",
				`### Goal
Ship the second most important story. StudyBuddy's daily plan, SplitIt's balances and settle-up, or Habitly's streaks and weekly chart.

### Expectations
- Derived numbers are computed in one place and tested
- The UI explains the numbers (for example how a balance was calculated)

### Hand in
The main PR link for today.`),
			peerReview(),
			dsaOranges(),
		),
		on(49,
			blog("fs-blog-mid", "Capstone, halfway",
				`### Write about
- What you've shipped and what's left, with screenshots
- One decision you'd make differently now
- How you're using issues and PRs to stay on track

300 to 600 words.

### Hand in
The link to the published post.`,
				"Published with live links", "Honest progress and plan", "Explains a decision and its trade-off"),
			standup("fs-w7-retro", "Week seven retro",
				`### Answer in three short parts
- **Went well**
- **Was hard**
- **Next week** you'll try differently

Are you on track for your plan? If not, what will you cut?`),
			popQuiz("fs-quiz-oop", "Pop quiz on OOP and design", ContentLead, "Five questions on object-oriented design.", quiz(
				mcq("Which principle says a class should have one reason to change?", 0, "Single responsibility", "Open and closed", "Liskov substitution", "Dependency inversion"),
				mcq("Polymorphism lets you", 2, "Hide fields", "Copy objects", "Call the same method on different types and get type-specific behaviour", "Inherit from many classes"),
				mcq("Composition over inheritance means", 1, "Never use classes", "Build behaviour by combining objects instead of deep class hierarchies", "Always inherit from a base class", "Use only functions"),
				mcq("An interface (or contract) is useful because", 3, "It runs faster", "It stores data", "It removes the need for tests", "Callers depend on what an object does, not how"),
				mcq("Dependency injection mainly makes code easier to", 1, "Write quickly", "Test, by passing in fakes", "Deploy", "Read aloud"),
			)),
		),
		on(50,
			capstoneBuild("fs-cap-third", "Capstone third feature",
				`### Goal
Ship your third story, or a stretch feature that makes the app stand out (sharing a group by link, reminders, export to CSV, or charts).

### Expectations
- Same quality bar, tests, states and clean PRs
- Feature flag or hide anything unfinished before the end of the day

### Hand in
The main PR link for today.`),
			dsaRob(),
		),
		on(51,
			ticket("fs-cap-states", "Capstone, every edge case handled", QALead, 1,
				`### Go through every screen and request and check
- Validation on both client and server, with the same rules and clear messages
- Loading, empty and error states everywhere data loads
- Double submits are impossible
- Very long text, zero items, hundreds of items and slow networks all behave
- The app works offline-ish (a clear message, not a blank screen)

Write the checklist in the PR description and tick what you fixed.

### Hand in
The PR link.`,
				links(link("Reacting to input with state", "https://react.dev/learn/reacting-to-input-with-state")),
				"Server and client validation match", "Every data view has loading, empty and error states", "No double submits", "Extreme inputs handled", "Checklist in the PR"),
			dsaCoinChange(),
		),
		on(52,
			ticket("fs-cap-tests", "Capstone test suite", QALead, 1,
				`### Deliverables
- API tests for every endpoint, including auth and ownership
- UI tests for the main journeys with mocked network
- One end-to-end test (Playwright) that signs up, does the main action and checks the result against a deployed preview or a local stack
- All of it in CI, required on `+"`main`"+`

### Hand in
The PR link, with the CI run linked.`,
				links(link("Playwright getting started", "https://playwright.dev/docs/intro"), link("Supertest", "https://github.com/ladjs/supertest")),
				"API tests cover endpoints, auth and ownership", "UI tests cover main journeys", "At least one Playwright end-to-end test", "Everything runs in CI and is required"),
			dsaLIS(),
		),
		on(53,
			ticket("fs-cap-perf-a11y", "Capstone accessibility and performance", DeliveryManager, 1,
				`### Targets on the deployed app (mobile)
- Lighthouse Performance 90 or more and Accessibility 95 or more on the main screens
- Every journey works by keyboard with visible focus
- API responses for main screens under 300 ms (check the slowest queries and add indexes)

### Hand in
The PR link with before and after numbers.`,
				links(link("Web Vitals", "https://web.dev/articles/vitals"), link("Learn accessibility (web.dev)", "https://web.dev/learn/accessibility"), link("PostgreSQL EXPLAIN", "https://www.postgresql.org/docs/current/using-explain.html")),
				"Lighthouse targets met or explained", "Keyboard-only journeys work", "Slow queries found and indexed", "Before and after numbers reported"),
			dsaUniquePaths(),
			popQuiz("fs-quiz-tx", "Pop quiz on transactions", BackendLead, "Five questions on keeping data correct.", quiz(
				mcq("What does the A in ACID stand for?", 1, "Availability", "Atomicity", "Authorisation", "Accuracy"),
				mcq("Two users split a bill at the same moment and the balance ends up wrong. This is a", 2, "Deadlock", "Syntax error", "Race condition", "Memory leak"),
				mcq("Wrapping several writes in a transaction ensures", 0, "They all happen or none do", "They run faster", "They are logged", "They can't be read"),
				mcq("A unique index on (group_id, email) prevents", 3, "Slow queries", "Deleted rows", "Long emails", "The same person joining a group twice"),
				mcq("Which isolation level allows dirty reads?", 1, "Serializable", "Read uncommitted", "Repeatable read", "Read committed"),
			)),
		),
		on(54,
			be("fs-cap-security", "Capstone security pass", 1,
				`### Check and fix, using the OWASP Top 10 as your list
- Authorization on every endpoint (try other users' ids)
- Input validation and output encoding
- Rate limits on auth and expensive endpoints
- Secrets only in env vars, rotated if they ever leaked
- Dependencies scanned (`+"`npm audit`"+`, Dependabot enabled)
- Security headers and cookie flags

### Hand in
The PR link, with a table in the description listing each risk, how your app handles it, and what you changed.`,
				links(link("OWASP Top 10", "https://owasp.org/www-project-top-ten/"), link("About Dependabot security updates", "https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates")),
				"Authorization verified on every endpoint", "Validation, rate limits and headers in place", "Dependencies scanned and Dependabot on", "Risk table in the PR"),
			dsaLCS(),
		),
		on(55,
			ticket("fs-cap-ship", "Ship the capstone to production", DeliveryManager, 1,
				`### Deliverables
- Production deploy of frontend, API and database from `+"`main`"+`
- Uptime monitoring on the health endpoint (UptimeRobot or similar) and error logging you actually check
- A demo account seeded, with its login in the README
- README with the problem, a GIF, features, architecture diagram, stack, how to run locally, tests and CI badges, API docs link and what's next
- A three-minute demo video linked in the README
- The capstone featured first in your portfolio

### Hand in
The final PR link. Live URL, demo login and video in the note.`,
				links(link("Make a README", "https://www.makeareadme.com"), link("UptimeRobot", "https://uptimerobot.com"), link("Loom", "https://www.loom.com")),
				"Everything deployed from main and working", "Monitoring and error logging set up", "Demo account works", "README complete with diagram and badges", "Demo video linked", "Featured in the portfolio"),
			dsaWordBreak(),
		),
		on(56,
			capstoneCaseStudy(),
			standup("fs-w8-retro", "Week eight retro",
				`### Answer in three short parts
- **Went well**
- **Was hard**
- **Last few days** you want to use for

The final days are interview preparation.`),
		),
		on(57,
			Item{Key: "fs-system-design", Type: domain.TaskDocReading, Title: "System design basics, a URL shortener", Persona: EngineeringManager, Review: domain.ReviewManual, Release: release, Due: day,
				Brief: `Freshers get a light system design question more often than you'd think. Work through this one in writing.

### Design a URL shortener (like bit.ly) and answer
1. The API (create a short link, redirect, and stats)
2. The data model and how you'd generate short codes without collisions
3. How redirects stay fast for a link that suddenly gets a million clicks (caching, which status code)
4. What breaks first as traffic grows, and how you'd scale it
5. How you'd stop abuse (spam links, enumeration)

Read the system design primer's sections on caching and load balancing first.

### Hand in
Your answers in the note, with a simple diagram linked if you drew one.`,
				Resources: links(link("System design primer", "https://github.com/donnemartin/system-design-primer"), link("HTTP redirections", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections")),
				Rubric:    []string{"Clear API and data model", "Sensible short-code generation without collisions", "Explains caching and redirect status choice", "Identifies scaling bottlenecks", "Addresses abuse"}},
			dsaMergeIntervals(),
		),
		on(58,
			vivaItem("fs-viva", "full-stack capstone"),
			dsaDecodeWays(),
		),
		on(59,
			interviewPrep(),
			popQuiz("fs-quiz-final", "Final mixed quiz", EngineeringManager, "Ten questions across everything. Take your time once it lands.", quiz(
				mcq("Which hook would you use to keep a value between renders without causing a re-render?", 1, "useState", "useRef", "useMemo", "useEffect"),
				mcq("What's the time complexity of looking up a key in a hash map, on average?", 0, "O(1)", "O(log n)", "O(n)", "O(n log n)"),
				mcq("Which HTTP status means the client must log in?", 2, "403", "404", "401", "409"),
				mcq("Where should a JWT live in a browser app for best protection against XSS?", 3, "localStorage", "A JavaScript variable", "The URL", "An httpOnly cookie"),
				mcq("BFS on an unweighted graph finds", 1, "The longest path", "The shortest path in number of edges", "Every cycle", "A topological order"),
				mcq("Which SQL statement removes all rows but keeps the table?", 0, "DELETE FROM tasks", "DROP TABLE tasks", "REMOVE tasks", "ALTER TABLE tasks"),
				mcq("A React list item loses its input text when rows are removed. The most likely cause is", 2, "Missing CSS", "Slow network", "Using the array index as the key", "Too many effects"),
				mcq("What does `git rebase -i` let you do?", 3, "Clone a repo", "Delete a remote", "Create a tag", "Reorder, squash or edit commits"),
				mcq("Which is the best first step when a production bug is reported?", 1, "Rewrite the feature", "Reproduce it reliably", "Roll back every deploy", "Ask the user to clear cache"),
				mcq("In dynamic programming, memoisation means", 0, "Caching results of subproblems", "Sorting the input", "Using recursion only", "Writing notes"),
			)),
		),
		on(60,
			finalPortfolio("fe-final-portfolio"),
			standup("fs-final-retro", "Final retro",
				`Sixty days. You shipped a portfolio, two React apps, an API with auth and a full-stack capstone.

### Answer
- The three things you can do now that you couldn't 60 days ago
- The piece of work you're proudest of, with a link
- What you'll learn next, and your plan for the next month

Thank you for the hard work. Your team lead will review everything for your certificate.`),
		),
	)
}
