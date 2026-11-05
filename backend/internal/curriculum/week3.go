package curriculum

// Week 3 (days 15 to 21). Routing, data fetching, errors and forms. Project 2 is a show
// finder on the free TVMaze API. Tickets now come with hints and doc links, not steps.
func week3() []Day {
	tvmaze := link("TVMaze API", "https://www.tvmaze.com/api")
	return days(
		on(15,
			standup("w3-kickoff", "Week three kickoff",
				`This week your app talks to a real API. Expect slow networks, empty results and errors, and handle them like a professional.

### Tell the team
- Your live task manager link
- What you'd still improve in it
- Whether you have used fetch or Promises before`),
			ticket("w3-scaffold", "Scaffold the show finder with routing", DeliveryManager, 1,
				`### Context
Project 2 is **Show Finder**. Users search TV shows, open a show's page and keep a list of favourites. Data comes from TVMaze, which needs no API key.

### What to build
- A new repo `+"`show-finder`"+` (Vite, React)
- React Router with routes for `+"`/`"+` (search), `+"`/shows/:id`"+` (details), `+"`/favourites`"+` and a 404 page for anything else
- A shared layout with a header and nav links, using `+"`<Outlet />`"+`
- The active nav link is styled and marked with `+"`aria-current=\"page\"`"+`

### Acceptance criteria
- Navigating doesn't reload the page
- An unknown URL shows your 404 page with a link home
- Each page sets a sensible `+"`document.title`"+`

### Hand in
The PR link from `+"`feat/routing`"+`. Data fetching comes tomorrow.`,
				links(link("React Router docs", "https://reactrouter.com/home"), tvmaze, link("Vite getting started", "https://vite.dev/guide/")),
				"Routes for search, details, favourites and 404", "Shared layout with Outlet", "Active link has aria-current", "No full page reloads when navigating"),
			reading("w3-async", "Promises, async and await",
				`### Read
MDN's guide to Promises and to using fetch.

### Then, in your notes, explain in your own words
1. What a Promise is, in one sentence
2. What `+"`await`"+` does, and why you can only use it inside an `+"`async`"+` function
3. Why `+"`fetch`"+` does **not** reject on a 404 or 500, and how you detect those
4. What happens if you forget `+"`await`"+` before `+"`response.json()`"+``,
				links(link("Using promises", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises"), link("Using the Fetch API", "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"),
					link("async function", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function"))),
			dsa("dsa-parentheses", "Valid parentheses",
				`Stacks, part one.

### Problem
`+"`s`"+` contains only the characters ( ) [ ] { }. Return true if every bracket is closed by the same type in the right order.

### Examples
`+"```"+`
isValid("()[]{}")  ->  true
isValid("([)]")  ->  false
isValid("{[]}")  ->  true
`+"```"+`

### Aim for
Push opening brackets onto a stack, pop when you see a closing one. O(n).`,
				practice("isValid", "function isValid(s) {\n  \n}\n",
					`["()"]`, "true", `["()[]{}"]`, "true", `["(]"]`, "false", `["([)]"]`, "false", `["{[]}"]`, "true", `["("]`, "false")),
		),
		on(16,
			ticket("w3-search", "Search shows with loading, empty and error states", DeliveryManager, 2,
				`### What to build
- A search box on `+"`/`"+`. Typing searches `+"`https://api.tvmaze.com/search/shows?q=QUERY`"+`.
- Wait until the user stops typing for 400 ms before calling the API (debounce)
- Results as cards with poster, name, year, genres and rating, linking to `+"`/shows/:id`"+`
- Four clear states, **loading** (skeleton cards), **empty** ("No shows match"), **error** (friendly message with a Retry button) and **idle** (before any search)
- Keep the query in the URL (`+"`/?q=office`"+`) so results survive a refresh and can be shared

### Acceptance criteria
- Network errors and non-OK responses both show the error state
- Shows without a poster get a placeholder, not a broken image
- Images have meaningful `+"`alt`"+` text
- The fetch logic lives in a small module (`+"`src/api/tvmaze.js`"+`), not inside the component

### Try this
In DevTools, throttle the network to Slow 3G and turn on Offline. Your UI should handle both well.

### Hand in
The PR link from `+"`feat/search`"+`, with screenshots of all four states.`,
				links(tvmaze, link("Using the Fetch API", "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"), link("useSearchParams", "https://reactrouter.com/home")),
				"Debounced search hits the TVMaze search endpoint", "Loading, empty, error and idle states all exist", "Non-OK responses are treated as errors",
				"Query is kept in the URL", "Fetching is separated into an api module", "Missing posters handled with a placeholder"),
			dsa("dsa-daily-temps", "Daily temperatures",
				`Stacks, part two. This pattern is called a monotonic stack.

### Problem
For each day in `+"`temps`"+`, return how many days you have to wait for a warmer temperature, or 0 if it never gets warmer.

### Examples
`+"```"+`
dailyTemperatures([73, 74, 75, 71, 69, 72, 76, 73])  ->  [1, 1, 4, 2, 1, 1, 0, 0]
dailyTemperatures([30, 40, 50, 60])  ->  [1, 1, 1, 0]
`+"```"+`

### Aim for
O(n). Keep a stack of indexes whose warmer day you haven't found yet.`,
				practice("dailyTemperatures", "function dailyTemperatures(temps) {\n  \n}\n",
					"[[73,74,75,71,69,72,76,73]]", "[1,1,4,2,1,1,0,0]", "[[30,40,50,60]]", "[1,1,1,0]", "[[30,60,90]]", "[1,1,0]", "[[90,80,70]]", "[0,0,0]")),
			popQuiz("w3-quiz-async", "Pop quiz on Promises and fetch", EngineeringManager, "Five questions on async JavaScript.", quiz(
				mcq("`fetch()` resolves (does not throw) when the server answers 404. How do you detect the failure?", 1, "It always throws", "Check `response.ok` or `response.status`", "Check `response.json()` for null", "You can't"),
				mcq("What does `await` do?", 2, "Runs code on another thread", "Makes the function synchronous", "Pauses the async function until the Promise settles", "Cancels the Promise"),
				mcq("What's the best way to run two independent requests at the same time and wait for both?", 0, "Promise.all", "Two awaits one after the other", "setTimeout", "A for loop"),
				mcq("What does debouncing a search input do?", 3, "Caches every result", "Sends a request on every keystroke", "Blocks typing while loading", "Waits until typing pauses before sending a request"),
				mcq("Where should a `try` and `catch` go around `await fetch(...)`?", 1, "Nowhere, fetch never fails", "Around the awaited call so network errors are handled", "Only in the browser console", "Inside the JSX"),
			)),
		),
		on(17,
			ticket("w3-details", "Build the show details page", DeliveryManager, 1,
				`### What to build
- `+"`/shows/:id`"+` loads the show from `+"`https://api.tvmaze.com/shows/ID?embed[]=cast&embed[]=seasons`"+`
- Show the poster, name, genres, rating, network, premiered date, summary, a cast list and the seasons
- TVMaze returns the summary as HTML. Render it **safely** (strip the tags or use a sanitiser), never with raw `+"`dangerouslySetInnerHTML`"+` on untrusted HTML.
- Cancel the request if the user leaves the page before it finishes (`+"`AbortController`"+` in the effect's cleanup)
- An unknown id shows a "Show not found" state, other failures show an error with Retry

### Acceptance criteria
- No "state update on an unmounted component" problems when navigating away quickly
- 404 from the API is handled separately from other errors
- Back to results keeps the previous search (the query is in the URL)

### Hand in
The PR link from `+"`feat/details`"+`.`,
				links(tvmaze, link("AbortController", "https://developer.mozilla.org/en-US/docs/Web/API/AbortController"), link("Fetching data with effects", "https://react.dev/learn/synchronizing-with-effects#fetching-data")),
				"Details, cast and seasons load from the embed endpoint", "Summary HTML is rendered safely", "Request is aborted on unmount", "Not found is handled apart from other errors",
				"Back navigation keeps the search"),
			reading("w3-http", "HTTP essentials for frontend developers",
				`### Read
MDN's overview of HTTP, then skim the status code and methods references.

### In your notes
1. What happens, step by step, between typing a URL and seeing the page
2. The difference between GET, POST, PUT, PATCH and DELETE, with one example each from Show Finder or the task manager
3. What 200, 201, 204, 301, 304, 400, 401, 403, 404, 429 and 500 mean
4. Open DevTools, Network, search for a show and describe the request and response headers you see`,
				links(link("An overview of HTTP", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview"), link("HTTP response status codes", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status"),
					link("HTTP request methods", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods"))),
			dsa("dsa-binary-search", "Binary search",
				`### Problem
`+"`nums`"+` is sorted ascending with distinct values. Return the index of `+"`target`"+`, or -1 if it isn't there.

### Examples
`+"```"+`
search([-1, 0, 3, 5, 9, 12], 9)  ->  4
search([-1, 0, 3, 5, 9, 12], 2)  ->  -1
`+"```"+`

### Aim for
O(log n). Get the loop condition and the mid calculation right, those are where bugs hide.`,
				practice("search", "function search(nums, target) {\n  \n}\n",
					"[[-1,0,3,5,9,12],9]", "4", "[[-1,0,3,5,9,12],2]", "-1", "[[5],5]", "0", "[[1,3],3]", "1", "[[],1]", "-1")),
		),
		on(18,
			ticket("w3-favourites", "Favourites with context and a reducer", DeliveryManager, 1,
				`### What to build
- A heart button on every card and on the details page to add or remove a favourite
- `+"`/favourites`"+` lists saved shows, with an empty state that links to search
- State lives in a `+"`FavouritesProvider`"+` built with `+"`useReducer`"+` and context, with actions `+"`add`"+`, `+"`remove`"+` and `+"`clear`"+`
- Favourites persist in `+"`localStorage`"+` (reuse your hook from the task manager)
- The nav shows the count, for example "Favourites (3)"

### Acceptance criteria
- Components use a `+"`useFavourites()`"+` hook, never the context object directly
- The reducer is a pure function with a test-friendly shape (no side effects inside it)
- The heart button says what it does to screen readers ("Add The Office to favourites")

### Hand in
The PR link from `+"`feat/favourites`"+`.`,
				links(link("Extracting state logic into a reducer", "https://react.dev/learn/extracting-state-logic-into-a-reducer"), link("Passing data deeply with context", "https://react.dev/learn/passing-data-deeply-with-context"),
					link("Scaling up with reducer and context", "https://react.dev/learn/scaling-up-with-reducer-and-context")),
				"Add and remove work from cards and details", "State is managed by a pure reducer behind context", "Components use a useFavourites hook",
				"Favourites persist across reloads", "Buttons have descriptive accessible names"),
			chore("w3-issues", "Plan work with issues and close them from pull requests",
				`Real teams track work in issues and link every PR to one.

### Steps
1. In `+"`show-finder`"+`, open an issue for each remaining feature this week (form, bug fixes, deploy). Give each a clear title, a short description and a checklist.
2. Create labels `+"`feature`"+`, `+"`bug`"+` and `+"`chore`"+` and apply them.
3. From now on, every PR description includes `+"`Closes #N`"+` so merging closes the issue.
4. Add a milestone "Show Finder v1" and put the issues in it.

### Hand in
The link to the repository's Issues tab. Your next PRs should close issues automatically.`,
				links(link("About issues", "https://docs.github.com/en/issues/tracking-your-work-with-issues/about-issues"), link("Linking a pull request to an issue", "https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue")),
				"An issue exists for each remaining feature", "Issues have labels and a milestone", "Issue descriptions include a checklist"),
			dsa("dsa-search-insert", "Search insert position",
				`### Problem
`+"`nums`"+` is sorted with distinct values. Return the index of `+"`target`"+` if it's there, otherwise the index where it would be inserted to keep the order.

### Examples
`+"```"+`
searchInsert([1, 3, 5, 6], 5)  ->  2
searchInsert([1, 3, 5, 6], 2)  ->  1
searchInsert([1, 3, 5, 6], 7)  ->  4
`+"```"+`

### Aim for
O(log n). This is binary search where the answer is where low ends up.`,
				practice("searchInsert", "function searchInsert(nums, target) {\n  \n}\n",
					"[[1,3,5,6],5]", "2", "[[1,3,5,6],2]", "1", "[[1,3,5,6],7]", "4", "[[1,3,5,6],0]", "0", "[[1],1]", "0")),
		),
		on(19,
			bug("w3-bug-race", "Old search results overwrite new ones",
				`### Bug report
**Reported by** a user on a slow mobile connection.

> I typed "breaking" and then quickly changed it to "the office". The list showed The Office for a second and then switched back to Breaking Bad results, even though the box says "the office".

### Reproduce
DevTools, Network, throttle to Slow 3G, then type one query and quickly change it.

### Expected
The list always matches what's in the search box.

### What to do
1. Reproduce it and describe the cause in the PR. Hint, responses can arrive in a different order from the requests.
2. Fix it so a stale response can never win. Either abort the previous request with `+"`AbortController`"+`, or ignore responses that don't belong to the latest query. Explain which you chose and why.
3. Make sure an aborted request doesn't show the error state.

### Hand in
A PR from `+"`fix/search-race`"+` that closes its issue.`,
				links(link("AbortController", "https://developer.mozilla.org/en-US/docs/Web/API/AbortController"), link("Fetching data, handling race conditions", "https://react.dev/learn/synchronizing-with-effects#fetching-data")),
				"Race reproduced and the cause explained", "Stale responses can never replace newer results", "Aborts don't show the error state", "PR closes the issue"),
			dsa("dsa-rotated-min", "Find the minimum in a rotated sorted array",
				`### Problem
A sorted array of distinct numbers was rotated some number of times, for example [0, 1, 2, 4, 5, 6, 7] became [4, 5, 6, 7, 0, 1, 2]. Return the smallest element.

### Examples
`+"```"+`
findMin([3, 4, 5, 1, 2])  ->  1
findMin([4, 5, 6, 7, 0, 1, 2])  ->  0
findMin([11, 13, 15, 17])  ->  11
`+"```"+`

### Aim for
O(log n). Compare the middle element with the right end to decide which half holds the minimum.`,
				practice("findMin", "function findMin(nums) {\n  \n}\n",
					"[[3,4,5,1,2]]", "1", "[[4,5,6,7,0,1,2]]", "0", "[[11,13,15,17]]", "11", "[[2,1]]", "1", "[[1]]", "1")),
			popQuiz("w3-quiz-http", "Pop quiz on HTTP and REST", ContentLead, "Five questions from Monday's HTTP reading.", quiz(
				mcq("Which status code means the request needs valid authentication?", 1, "403", "401", "404", "500"),
				mcq("Which method should be safe to call many times without changing anything on the server?", 0, "GET", "POST", "DELETE", "PATCH"),
				mcq("A server returns 201 after a POST. What does it usually mean?", 2, "Nothing changed", "The request was malformed", "A new resource was created", "The server crashed"),
				mcq("What does 429 mean?", 3, "Not found", "Moved permanently", "Unsupported media type", "Too many requests"),
				mcq("Which header tells the server the body is JSON?", 1, "Accept: text/html", "Content-Type: application/json", "Authorization: Bearer", "Cache-Control: no-store"),
			)),
		),
		on(20,
			ticket("w3-form", "Add a Suggest a show form with accessible validation", DeliveryManager, 1,
				`### What to build
A `+"`/suggest`"+` page where users suggest a show for the editors' picks.
- Fields for show name (required), why you like it (required, 30 to 500 characters), your email (required, valid), a genre select and "I'd like a reply" (checkbox)
- Validate on submit and then on blur, with one clear message per field
- On submit, move focus to the first invalid field, and show an error summary at the top that links to each field
- On success, show a confirmation and clear the form. You can fake the request with a short delay.
- A live character counter for the long field

### Acceptance criteria
- Every field has a visible label and its error is linked with `+"`aria-describedby`"+`
- Invalid fields have `+"`aria-invalid`"+`
- The submit button shows a busy state and can't be double-submitted
- Works with the keyboard alone

### Hand in
The PR link from `+"`feat/suggest-form`"+`, closing its issue.`,
				links(link("Client-side form validation", "https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation"), link("Forms tutorial (W3C WAI)", "https://www.w3.org/WAI/tutorials/forms/"),
					link("Reacting to input with state", "https://react.dev/learn/reacting-to-input-with-state")),
				"All validation rules work with clear per-field messages", "Focus moves to the first error and a summary links to fields", "Errors linked with aria-describedby and aria-invalid",
				"No double submit", "Fully usable by keyboard"),
			dsa("dsa-max-window", "Maximum sum of k consecutive numbers",
				`Sliding windows, a pattern that shows up everywhere.

### Problem
Return the largest sum of any `+"`k`"+` consecutive numbers in `+"`nums`"+`. Assume 1 ≤ k ≤ nums.length.

### Examples
`+"```"+`
maxSumK([2, 1, 5, 1, 3, 2], 3)  ->  9    (5 + 1 + 3)
maxSumK([2, 3, 4, 1, 5], 2)  ->  7
`+"```"+`

### Aim for
O(n). Slide the window by adding the new number and subtracting the one that left.`,
				practice("maxSumK", "function maxSumK(nums, k) {\n  \n}\n",
					"[[2,1,5,1,3,2],3]", "9", "[[2,3,4,1,5],2]", "7", "[[1,2,3],3]", "6", "[[-1,-2,-3,-4],2]", "-3", "[[5],1]", "5")),
		),
		on(21,
			ticket("w3-ship", "Ship Show Finder", DeliveryManager, 1,
				`### What to do
1. Merge the approved PRs and close the milestone.
2. Deploy to Vercel or Netlify. Client-side routes need a rewrite so `+"`/shows/123`"+` works on refresh (a `+"`vercel.json`"+` rewrite or a Netlify `+"`_redirects`"+` file).
3. README with screenshots, features, how to run, the API used and known limitations.
4. Add Show Finder to your portfolio.
5. Lighthouse on the live site, mobile, and note the four scores.

### Acceptance criteria
- Refreshing on a details page works on the live site
- README credits TVMaze (their licence asks for it)
- Portfolio shows all three projects so far

### Hand in
The final PR link. Put the live URL and the Lighthouse scores in the note.`,
				links(link("Deploying a static Vite site", "https://vite.dev/guide/static-deploy"), link("Netlify redirects and rewrites", "https://docs.netlify.com/routing/redirects/"), tvmaze),
				"Live site works, including refresh on a details route", "README is complete and credits TVMaze", "Portfolio updated with Show Finder", "Lighthouse scores reported"),
			blog("w3-blog", "Loading, empty and error states, done well",
				`### Write about
- The four states of your search page and why each matters
- The race condition bug, how you found it and how you fixed it
- One thing you'd do differently with a real backend

400 to 800 words, with screenshots and a short code snippet, linking to the live Show Finder.

### Hand in
The link to the published post.`,
				"Published and links to the live app", "Explains the race condition clearly", "Covers loading, empty and error with examples", "Includes a code snippet and screenshots"),
			standup("w3-retro", "Week three retro",
				`### Answer in three short parts
- **Went well**
- **Was hard**
- **Next week** you'll try differently

Also list the three things in your code you're least proud of. We'll revisit them.`),
		),
	)
}

// foundation is weeks 1 to 3, shared by both programs.
func foundation() []Day {
	out := week1()
	out = append(out, week2()...)
	return append(out, week3()...)
}
