package curriculum

import "github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"

// Shared late-program tasks, used by both programs at different points.

func testingTicket() Item {
	return Item{Key: "t-tests-p1", Type: domain.TaskFeature, Title: "Add tests to the task manager", Persona: QALead, Review: domain.ReviewManual,
		Release: release, Due: 2 * day, Brief: `### Context
Untested code is a guess. Add a real test suite to the task manager so you can change it without fear.

### What to build
- Vitest and React Testing Library set up (` + "`npm run test`" + `)
- At least **six tests** that use the app like a user would
  - adding a task shows it in the list
  - a blank title shows the error and adds nothing
  - ticking a task updates the counter
  - editing with Enter saves and Escape cancels
  - the filters show the right tasks
  - tasks survive a remount (mock or clear localStorage between tests)
- Query by role and label (` + "`getByRole`" + `, ` + "`getByLabelText`" + `), not by class names or test ids where a role exists

### Acceptance criteria
- ` + "`npm run test`" + ` passes from a clean clone
- Tests don't depend on each other's order
- One test reproduces last week's keys bug, so it can't come back

### Hand in
The PR link from ` + "`test/task-manager`" + `. Paste the test output in the description.`,
		Resources: links(link("Testing Library guiding principles", "https://testing-library.com/docs/guiding-principles"), link("React Testing Library intro", "https://testing-library.com/docs/react-testing-library/intro/"),
			link("Vitest getting started", "https://vitest.dev/guide/"), link("Which query should I use", "https://testing-library.com/docs/queries/about/#priority")),
		Rubric: []string{"At least six meaningful tests that pass from a clean clone", "Queries by role and label, not implementation details", "Tests are independent of order and storage",
			"A regression test covers the keys bug", "Test output is in the PR"}}
}

func perfTicket() Item {
	return ticket("t-perf-p2", "Make Show Finder fast", DeliveryManager, 1,
		`### Context
Users on cheap phones and slow networks leave slow sites. Measure first, then fix.

### What to do
1. Run Lighthouse (mobile) on the live Show Finder and save the report. Note LCP, CLS and the Performance score.
2. Fix what the report points to. Typical wins
   - lazy-load routes with `+"`React.lazy`"+` and `+"`Suspense`"+`
   - give images `+"`width`"+`, `+"`height`"+` and `+"`loading=\"lazy\"`"+` below the fold
   - use TVMaze's medium images in lists, original only on the details page
   - avoid layout shift with fixed-size skeletons
3. Measure again on the deployed site.

### Acceptance criteria
- Performance score of 90 or more on mobile, or a clear explanation of what's left and why
- CLS under 0.1
- Before and after numbers in the PR description

### Hand in
The PR link from `+"`perf/show-finder`"+`.`,
		links(link("Web Vitals", "https://web.dev/articles/vitals"), link("React.lazy", "https://react.dev/reference/react/lazy"), link("Lighthouse overview", "https://developer.chrome.com/docs/lighthouse/overview"),
			link("Optimize Cumulative Layout Shift", "https://web.dev/articles/optimize-cls")),
		"Before and after Lighthouse numbers are in the PR", "Routes are lazy-loaded", "Images are sized and lazy-loaded", "Mobile Performance is 90 or more, or explained",
		"CLS under 0.1")
}

func cicdTicket() Item {
	return ticket("t-ci", "Run lint and tests on every pull request", DeliveryManager, 1,
		`### Context
On a team, nobody merges a PR with failing tests. Make GitHub check that for you.

### What to build
- A GitHub Actions workflow `+"`.github/workflows/ci.yml`"+` in the task manager (and Show Finder) that runs on pull requests and on pushes to `+"`main`"+`
- Steps that check out the code, set up Node LTS with npm caching, run `+"`npm ci`"+`, `+"`npm run lint`"+`, `+"`npm run test -- --run`"+` and `+"`npm run build`"+`
- Branch protection on `+"`main`"+` so the CI check must pass before merging

### Acceptance criteria
- The workflow runs on this PR and passes
- A deliberately failing test on a throwaway branch makes the check fail (screenshot it, then delete the branch)
- The README shows a CI status badge

### Hand in
The PR that adds the workflow.`,
		links(link("GitHub Actions documentation", "https://docs.github.com/en/actions"), link("Building and testing Node.js", "https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs"),
			link("About protected branches", "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches")),
		"Workflow runs lint, tests and build on PRs", "Uses npm ci with caching", "Branch protection requires the check", "Failing case shown and README has a badge")
}

func vivaItem(key, project string) Item {
	return Item{Key: key, Type: domain.TaskDocReading, Title: "Viva on your " + project, Persona: TeamLead, Review: domain.ReviewManual, Release: "11:00", Due: day,
		Brief: `In real interviews you'll be asked about your own code. Answer these about your ` + project + `, in writing, in your own words. Short answers are fine, vague ones aren't.

### Questions
1. Walk through what happens, file by file, when a user does the main action in your app.
2. Which piece of state lives where, and why there?
3. What's the trickiest bug you hit and how did you find the cause?
4. If the data were 100 times bigger, what would break first and how would you fix it?
5. Point to one piece of code you'd rewrite, and say how.

### Hand in
Answer in the note when you hand this in. Link to specific files or lines in your repo where it helps.`,
		Rubric: []string{"Explains the main flow accurately with file references", "Justifies where state lives", "Describes a real bug and the debugging steps",
			"Reasons sensibly about scale", "Shows honest, specific self-critique"}}
}

func capstoneKickoff(key string, fullstack bool) Item {
	scope := `a frontend-only app. Use a public API or localStorage for data.`
	if fullstack {
		scope = `a full-stack app with your own API, a PostgreSQL database and login.`
	}
	return Item{Key: key, Type: domain.TaskFeature, Title: "Capstone kickoff, plan it like a product", Persona: TeamLead, Review: domain.ReviewManual, Release: release, Due: day,
		Brief: `Your capstone is the project you'll talk about in interviews. From here on you get product briefs, not step-by-step guides. You decide the details and we review them like a busy senior would.

The capstone is ` + scope + `

### Pick one brief
**1. StudyBuddy** helps students plan exam prep. Subjects, topics with a status, a daily plan and a streak.
**2. SplitIt** splits trip expenses among friends. Groups, expenses, who owes whom and settling up.
**3. Habitly** tracks daily habits. Habits with schedules, check-ins, streaks and a weekly chart.

Or propose your own of similar size in chat first.

### Deliverables for today
- A new repo with a README containing the **problem**, the **users**, five to eight **user stories** ("As a … I want … so that …") and what's **out of scope**
- A rough wireframe of the main screens (Excalidraw, Figma or paper photographed), linked in the README
- GitHub issues for every story, in a "Capstone v1" milestone, labelled and roughly sized (S, M or L)
- The data model, the main entities and their fields
- A plan of which issues you'll ship on which day until the deadline

### Hand in
The repository link. We'll review the plan before you start building.`,
		Resources: links(link("User stories with examples", "https://www.atlassian.com/agile/project-management/user-stories"), link("Excalidraw", "https://excalidraw.com"),
			link("About milestones", "https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones")),
		Rubric: []string{"Clear problem, users and out-of-scope list", "Five to eight well-formed user stories", "Wireframes for the main screens",
			"Issues for every story in a milestone with sizes", "Data model covers the stories", "Realistic day-by-day plan"}}
}

func capstoneBuild(key, title, brief string) Item {
	return ticket(key, title, DeliveryManager, 2, brief, links(link("Linking a pull request to an issue", "https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue")),
		"Scope matches the linked issues", "Works end to end with loading, empty and error states", "Small focused commits and a clear PR description", "No console errors or lint warnings")
}

func finalPortfolio(key string) Item {
	return ticket(key, "Final portfolio and resume update", DeliveryManager, 1,
		`### What to do
1. Update your portfolio with every project from this internship, each with a one-line pitch, the stack, a screenshot, and code and live links.
2. Pin the repositories on your GitHub profile and write a profile README.
3. Write three resume bullet points per project. Lead with an action and a result, for example "Built a React task manager with filters and persistence, covered by 8 tests and CI".
4. Ask a friend to open your portfolio on their phone and watch them use it. Fix what confuses them.

### Hand in
The PR link on your portfolio repo. Paste your resume bullets in the note.`,
		links(link("Managing your profile README", "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/managing-your-profile-readme"),
			link("Pinning items to your profile", "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/pinning-items-to-your-profile")),
		"Portfolio lists every project with working links", "GitHub profile has pinned repos and a README", "Resume bullets lead with action and impact", "Portfolio works well on a phone")
}

// frontendFinale is days 22 to 30 of the 30-day program. Testing, performance, then a
// capstone from a product brief with ticket-only guidance.
func frontendFinale() []Day {
	return days(
		on(22,
			standup("fe-w4-kickoff", "Final stretch kickoff",
				`Nine days left. This week you test and speed up what you built, then ship a capstone on your own.

### Tell the team
- Links to your three live projects
- Which one you're proudest of and why
- What you want your capstone to show a recruiter`),
			testingTicket(),
			reading("fe-testing-reading", "How to test the way users use your app",
				`### Read
The Testing Library guiding principles and the "Which query should I use" page.

### In your notes
1. Why test behaviour instead of implementation?
2. Rank `+"`getByRole`"+`, `+"`getByTestId`"+` and `+"`getByText`"+` by preference and say why
3. Write the names of three tests your capstone will need`,
				links(link("Testing Library guiding principles", "https://testing-library.com/docs/guiding-principles"), link("Which query should I use", "https://testing-library.com/docs/queries/about/#priority"))),
			dsaMergeIntervals(),
		),
		on(23,
			perfTicket(),
			dsaLongestSubstring(),
			popQuiz("fe-quiz-testing", "Pop quiz on testing and performance", QALead, "Five questions on tests and web vitals.", quiz(
				mcq("Which Testing Library query should you reach for first?", 0, "getByRole", "getByTestId", "querySelector", "getByClassName"),
				mcq("What does LCP measure?", 2, "How long JavaScript takes to parse", "Layout stability", "When the largest content element is rendered", "Time to the first byte"),
				mcq("A layout shift happens when an image loads with no size set. Which fix helps most?", 1, "Compress the image", "Set width and height (or aspect-ratio)", "Use a GIF", "Load it with JavaScript"),
				mcq("What's a good reason a test is flaky?", 3, "It uses getByRole", "It runs in Vitest", "It has a clear name", "It depends on real time, network or test order"),
				mcq("React.lazy is mainly used to", 1, "Memoize components", "Split code so routes load on demand", "Fetch data", "Delay effects"),
			)),
		),
		on(24,
			capstoneKickoff("fe-capstone-plan", false),
			dsaProductExceptSelf(),
		),
		on(25,
			capstoneBuild("fe-capstone-core", "Capstone, build the core flow",
				`### Goal
Ship the main user journey end to end. For StudyBuddy that's adding subjects and topics, for SplitIt creating a group and adding an expense, for Habitly creating a habit and checking in.

### Expectations
- Work from your issues, one PR per issue or small group of issues, each closing them
- Routing and layout in place
- Data persisted (localStorage, or the public API you chose)
- Loading, empty and error states where data can be missing

### Hand in
The link to your main PR for today. Link the others in the note.`),
			dsaTopKFrequent(),
		),
		on(26,
			capstoneBuild("fe-capstone-second", "Capstone, the second feature and polish",
				`### Goal
Ship the second most important story (StudyBuddy's daily plan, SplitIt's balances, Habitly's streaks), plus editing and deleting what users create.

### Expectations
- Derived values (totals, balances, streaks) are computed, not stored
- Confirm before destructive actions
- Mobile layout works at 360 px

### Hand in
The main PR link for today.`),
			peerReview(),
			dsaRotateArray(),
		),
		on(27,
			ticket("fe-capstone-quality", "Capstone, tests and accessibility", QALead, 1,
				`### What to do
- At least **five** behaviour tests for your capstone's core flows, running in CI
- Lighthouse Accessibility 95 or more on every main screen
- Keyboard-only walkthrough of the main journey, fixing every trap or invisible focus
- Run the axe DevTools extension and fix serious issues

### Hand in
The PR link, with the test output and Lighthouse scores in the description.`,
				links(link("Learn accessibility (web.dev)", "https://web.dev/learn/accessibility"), link("axe DevTools browser extension", "https://www.deque.com/axe/devtools/"), link("React Testing Library intro", "https://testing-library.com/docs/react-testing-library/intro/")),
				"At least five behaviour tests passing in CI", "Lighthouse Accessibility 95 or more on main screens", "Full journey works by keyboard", "axe serious issues fixed"),
			popQuiz("fe-quiz-cs", "Pop quiz on CS fundamentals", ContentLead, "Five questions that come up in campus interviews.", quiz(
				mcq("What does DNS do?", 1, "Encrypts traffic", "Turns a domain name into an IP address", "Serves web pages", "Stores cookies"),
				mcq("Which is true about a process and a thread?", 2, "Threads can't share memory", "A process is part of a thread", "Threads of one process share its memory", "They are the same thing"),
				mcq("What is the time complexity of finding an item in a balanced binary search tree?", 0, "O(log n)", "O(1)", "O(n)", "O(n log n)"),
				mcq("HTTPS mainly adds", 3, "Faster loading", "Caching", "Compression", "Encryption and server authentication"),
				mcq("In OOP, encapsulation means", 1, "Inheriting from many classes", "Hiding internal state behind a public interface", "Writing everything in one class", "Using global variables"),
			)),
			dsaRotatedSearch(),
		),
		on(28,
			ticket("fe-capstone-ship", "Ship the capstone", DeliveryManager, 1,
				`### What to do
1. Deploy the capstone. Refreshing any route must work.
2. README with the problem, a GIF of the main flow, features, the stack, how to run it, test and CI badges, and what's next
3. Record a two-minute demo video (Loom or similar) and link it in the README
4. Add the capstone to your portfolio as the featured project

### Hand in
The final PR link. Put the live URL and the video link in the note.`,
				links(link("Deploying a static Vite site", "https://vite.dev/guide/static-deploy"), link("Make a README", "https://www.makeareadme.com"), link("Loom", "https://www.loom.com")),
				"Capstone is live and every route survives a refresh", "README is complete with GIF, badges and run steps", "Two-minute demo video linked", "Featured in the portfolio"),
			capstoneCaseStudy(),
		),
		on(29,
			vivaItem("fe-viva", "capstone"),
			interviewPrep(),
			dsaMeetingRooms(),
		),
		on(30,
			finalPortfolio("fe-final-portfolio"),
			standup("fe-final-retro", "Final retro",
				`You made it. One last standup.

### Answer
- The three things you can do now that you couldn't 30 days ago
- The piece of work you're proudest of, with a link
- What you'll learn next, and your plan for the next month

Thank you for the hard work. Your team lead will review everything for your certificate.`),
		),
	)
}

func peerReview() Item {
	return review("fe-review-peer", "Review a capstone pull request",
		`Pair up with another intern (ask in chat if you need a partner). If nobody's free, review your own oldest open PR as if a teammate wrote it.

### Do
- Read the linked issue first, then the diff
- Run the branch locally and try to break it
- Leave at least **five** comments covering correctness, naming, accessibility and one thing done well
- Submit the review as Approve or Request changes, with a summary

### Hand in
The link to the PR you reviewed.`,
		"Reviewed against the linked issue's goal", "Ran the branch and reports what was tried", "At least five specific comments", "Mix of must-fix and praise with reasons", "Clear verdict and summary")
}

func capstoneCaseStudy() Item {
	return blog("fe-blog-capstone", "Write your capstone case study",
		`A case study shows how you think, not just what you built.

### Structure
1. The problem and who it's for
2. Key decisions (state, data, libraries) and the trade-offs
3. The hardest bug and how you solved it
4. What the tests and Lighthouse scores say
5. What you'd do with two more weeks

600 to 1,000 words, with screenshots and links to the live app and the code.

### Hand in
The link to the published post.`,
		"Published with live and code links", "Explains decisions and trade-offs, not just features", "Includes a real debugging story", "Uses evidence (tests, scores, screenshots)")
}

func interviewPrep() Item {
	return Item{Key: "fe-interview-prep", Type: domain.TaskDocReading, Title: "Prepare your interview stories", Persona: EngineeringManager, Review: domain.ReviewManual, Release: "15:00", Due: day,
		Brief: `Behavioural questions decide more offers than people think. Prepare three short stories with the STAR method (Situation, Task, Action, Result), using this internship.

### Write one story each for
1. A time you were stuck and how you got unstuck
2. A time a review asked you to change something you disagreed with
3. Something you shipped that you're proud of, with a number in the result

Also practise explaining Two Sum and Valid Parentheses out loud in under two minutes each.

### Hand in
The three stories in the note.`,
		Resources: links(link("Behavioral interviews (Tech Interview Handbook)", "https://www.techinterviewhandbook.org/behavioral-interview/"), link("The STAR method", "https://www.themuse.com/advice/star-interview-method")),
		Rubric:    []string{"Three complete STAR stories", "Stories are specific to this internship", "Results include concrete outcomes", "Concise enough to tell in two minutes"}}
}
