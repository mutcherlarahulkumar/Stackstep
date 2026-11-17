package reviewlab

// definitions is the exercise library, easiest first. Each issue id is marked in a patch.
func definitions() []def {
	return []def{
		{
			key: "modal-a11y", difficulty: Easy, number: 42, language: "React",
			title:   "Add a reusable Modal component",
			summary: "A small React dialog with a few accessibility and event handling slips.",
			author:  "maya-ui", branch: "feat/modal", base: "main",
			body: `Adds a **Modal** we can reuse for the settings and delete confirmations.

- Locks page scroll while open
- Closes when you click the backdrop or the close button

Screenshots are in the design ticket. Happy to change the styling later.`,
			commits: []Commit{{SHA: "a41c9e0", Message: "Add Modal component"}, {SHA: "7d02b3f", Message: "Lock scroll while the modal is open"}},
			files:   []fileDef{{path: "src/components/Modal.jsx", language: "jsx", patch: "modal-a11y.patch"}},
			issues: []issueDef{
				{"no-dialog-role", SevA11y, "Not announced as a dialog",
					"The modal is a plain div. Screen readers never hear that a dialog opened. It needs role=\"dialog\", aria-modal=\"true\" and aria-labelledby pointing at the heading, and focus should move into it."},
				{"div-button", SevA11y, "Close control is a div",
					"A clickable div can't be reached with Tab or pressed with Enter or Space, and it has no accessible name. Use a button with aria-label=\"Close\"."},
				{"click-bubbles", SevBug, "Clicking inside the modal closes it",
					"The click handler is on the backdrop, and clicks inside the modal bubble up to it. Typing in a field or pressing a button inside closes the dialog. Check that the click target is the backdrop itself, or stop propagation in the modal."},
				{"no-escape", SevBug, "No Escape key, and the scroll lock can leak",
					"Dialogs should close on Escape. The effect also never cleans up, so if the modal unmounts while open the page stays unscrollable. Add a keydown listener and return a cleanup that restores overflow."},
			},
		},
		{
			key: "users-pagination", difficulty: Easy, number: 118, language: "JavaScript",
			title:   "Paginate and search the users endpoint",
			summary: "An Express route gains paging and search, plus a SQL mistake you shouldn't miss.",
			author:  "ravi-backend", branch: "feat/users-pagination", base: "main",
			body: `The admin users table was loading everyone at once. This adds:

- ?page and ?limit (20 by default)
- ?q to search by name
- total in the response so the UI can show page counts

Added a basic test for the first page.`,
			commits: []Commit{{SHA: "c0ffee1", Message: "Paginate GET /users"}, {SHA: "9ab3d22", Message: "Search users by name"}, {SHA: "51e8a07", Message: "Add a test for the first page"}},
			files: []fileDef{
				{path: "src/routes/users.js", language: "javascript", patch: "users-pagination.users.patch"},
				{path: "test/users.test.js", language: "javascript", patch: "users-pagination.test.patch"},
			},
			issues: []issueDef{
				{"sql-injection", SevSecurity, "SQL injection through the search box",
					"The search text, limit and offset are pasted into the SQL string. A search like ' OR 1=1 -- reads or changes any data. Pass them as query parameters ($1, $2, $3) instead."},
				{"off-by-one", SevBug, "Page 1 skips the first page",
					"offset = page * limit means page 1 starts at row 20. It should be (page - 1) * limit."},
				{"no-cap", SevPerformance, "Limit has no upper bound",
					"Anyone can ask for ?limit=1000000 and pull the whole table in one request. Clamp it, for example to 100."},
				{"missing-await", SevBug, "The total is a Promise",
					"db.query returns a Promise, so total.rows is undefined and the route throws on every request. Await it, ideally with the same search filter so the count matches."},
			},
		},
		{
			key: "search-debounce", difficulty: Medium, number: 207, language: "TypeScript",
			title:   "Search products as you type",
			summary: "A debounced search box in React with effect and rendering bugs.",
			author:  "lena-frontend", branch: "feat/live-search", base: "main",
			body: `Results now update while you type instead of after pressing Enter. Requests are debounced by 300 ms so we don't hit the API on every key.

Tested by typing quickly in Chrome.`,
			commits: []Commit{{SHA: "e7f1a90", Message: "Debounce product search"}, {SHA: "0b9c4d1", Message: "Render results list"}},
			files:   []fileDef{{path: "src/components/SearchBox.tsx", language: "tsx", patch: "search-debounce.patch"}},
			issues: []issueDef{
				{"deps", SevBug, "The effect only runs once",
					"The dependency array is empty, so the effect runs on mount and never again. Typing does nothing. It needs [query]."},
				{"no-cleanup", SevBug, "The timer is never cleared",
					"Without returning () => clearTimeout(timer), every keystroke would schedule its own request. That is the opposite of a debounce and also runs after unmount."},
				{"race", SevBug, "Old responses can overwrite new ones",
					"If the request for \"ph\" answers after the one for \"phone\", the list shows the wrong results. Ignore stale responses with a flag in the cleanup or an AbortController."},
				{"index-key", SevPerformance, "Array index used as the key",
					"The list was keyed by p.id and now uses the index. When results change, React reuses the wrong rows and loses their state. Keep key={p.id}."},
			},
		},
		{
			key: "signup-hashing", difficulty: Medium, number: 64, language: "Python",
			title:   "Add sign up with hashed passwords",
			summary: "A Flask sign-up route with several security problems.",
			author:  "arjun-py", branch: "feat/signup", base: "main",
			body: `Adds POST /signup. Passwords are hashed before they are stored, never saved in plain text.

Logging the sign-up so we can follow new accounts in the dashboard.`,
			commits: []Commit{{SHA: "3e1d5aa", Message: "Add sign up endpoint"}, {SHA: "b72f018", Message: "Log new sign ups"}},
			files:   []fileDef{{path: "app/auth.py", language: "python", patch: "signup-hashing.patch"}},
			issues: []issueDef{
				{"logs-password", SevSecurity, "The password is written to the logs",
					"Logs are kept for a long time and read by many people and tools. Never log passwords or tokens. Log the email or user id only."},
				{"md5", SevSecurity, "MD5 is not a password hash",
					"MD5 is fast and unsalted, so leaked hashes are cracked in seconds with lookup tables. Use a slow, salted algorithm such as bcrypt, scrypt or argon2 (for example werkzeug.security.generate_password_hash)."},
				{"weak-minimum", SevSecurity, "A 4 character minimum is too weak",
					"Four characters can be guessed almost instantly. Ask for at least 8 to 12 characters and check against common passwords."},
				{"duplicate-email", SevBug, "A second sign up with the same email crashes",
					"Nothing checks whether the email is taken, so the insert fails on the unique index and the user gets a 500. Check first or catch the integrity error and answer 409."},
			},
		},
		{
			key: "price-cache", difficulty: Hard, number: 311, language: "Go",
			title:   "Cache prices from the pricing service",
			summary: "A Go in-memory cache with a data race and two subtle logic bugs.",
			author:  "sam-go", branch: "perf/price-cache", base: "main",
			body: `The product page calls the pricing service for every item, which is slow. This keeps each price for a minute.

Benchmarks locally went from about 180 ms to 4 ms per page.`,
			commits: []Commit{{SHA: "f4a2c19", Message: "Add a one minute price cache"}, {SHA: "6d81e3b", Message: "Serve prices over HTTP"}},
			files: []fileDef{
				{path: "internal/pricing/cache.go", language: "go", patch: "price-cache.cache.patch"},
				{path: "internal/pricing/handler.go", language: "go", patch: "price-cache.handler.patch"},
			},
			issues: []issueDef{
				{"data-race", SevBug, "The map is used from many requests at once",
					"HTTP handlers run concurrently, and Go maps aren't safe for concurrent reads and writes. This can crash the server with \"concurrent map writes\". Guard entries with a sync.RWMutex (or use sync.Map)."},
				{"inverted-expiry", SevBug, "Fresh entries are refetched and stale ones are served",
					"e.expires.Before(time.Now()) is true only after the entry expired, so the cache returns stale prices and always refetches fresh ones. It should be time.Now().Before(e.expires)."},
				{"ignored-error", SevBug, "A failed fetch caches a price of zero",
					"The error from fetch is dropped, so an outage stores 0 cents for a minute and shows free products. Return the error and don't cache failures."},
			},
		},
	}
}
