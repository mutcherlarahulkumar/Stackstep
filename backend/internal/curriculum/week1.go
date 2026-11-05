package curriculum

// Week 1 (days 1 to 7). Local setup, Git and the first pull request, then a hand-built
// portfolio site in HTML, CSS and JavaScript. Every ticket has a step-by-step guide.
func week1() []Day {
	return days(
		on(1,
			standup("w1-intro", "Say hello to the team",
				`Welcome aboard! Before any code, tell the team who you are.

### Post a short intro with
- Your name, college and year
- What you want to be able to build in 30 days
- One thing you already know well and one thing that scares you a little

Keep it to five or six lines. There are no wrong answers, we just want to know how to help you.`),
			chore("w1-setup", "Set up your machine and your first repository",
				`Everything here is done on your own computer, the way real teams work. Today you set up the tools and create the repository your portfolio will live in.

### Steps
1. Install **Git**, **Node.js LTS** and **VS Code** (links below). On Windows, use Git Bash as your terminal.
2. Tell Git who you are (use the email on your GitHub account).
   `+"```bash"+`
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   git config --global init.defaultBranch main
   `+"```"+`
3. Connect your computer to GitHub with an SSH key, or install the GitHub CLI and run `+"`gh auth login`"+`.
4. On GitHub, create a public repository named `+"`portfolio`"+` with a README.
5. Clone it, open it in VS Code and check everything works.
   `+"```bash"+`
   git clone git@github.com:<your-username>/portfolio.git
   cd portfolio
   node --version && npm --version && git --version
   `+"```"+`
6. Add a `+"`.gitignore`"+` with `+"`node_modules/`"+` and `+"`.DS_Store`"+`, then commit and push it.
   `+"```bash"+`
   git add .gitignore
   git commit -m "chore: add gitignore"
   git push
   `+"```"+`

### Hand in
The link to your repository. In the note, paste the output of the three version commands.

Stuck on an error? Paste the full error in chat. The exact message is what we need.`,
				links(link("Install Git", "https://git-scm.com/book/en/v2/Getting-Started-Installing-Git"), link("First-time Git setup", "https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup"),
					link("Node.js downloads (pick LTS)", "https://nodejs.org/en/download"), link("Connect to GitHub with SSH", "https://docs.github.com/en/authentication/connecting-to-github-with-ssh"),
					link("VS Code setup", "https://code.visualstudio.com/docs/setup/setup-overview")),
				"Public repo named portfolio with a README", "Commit author matches the student's GitHub email", ".gitignore excludes node_modules",
				"Note shows Git, Node and npm versions"),
			reading("w1-how-we-work", "How we work here",
				`Read this once, then skim the links. It is how every task in this internship works.

### The loop
1. A ticket lands on your board and in chat.
2. You create a **branch** for it, named after the work, like `+"`feat/hero-section`"+` or `+"`fix/empty-form`"+`.
3. You make small commits with clear messages.
4. You push and open a **pull request** (PR) into `+"`main`"+`, describe what changed and how to check it.
5. You hand the PR link in on the task. A manager reviews it and either approves or asks for changes.
6. Changes requested? Push more commits to the **same branch**. The PR updates by itself.
7. Approved? Merge it on GitHub and delete the branch.

### Good commit messages
Write them in the imperative, like `+"`add contact section`"+`, not `+"`added stuff`"+`. Many teams prefix the type, like `+"`feat:`"+`, `+"`fix:`"+` or `+"`docs:`"+`.

### When you're stuck
Try for 20 minutes, then ask in chat with what you tried and the exact error. Asking well is a skill we grade.`,
				links(link("Creating a pull request", "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request"),
					link("How to write a Git commit message", "https://cbea.ms/git-commit/"), link("Conventional Commits", "https://www.conventionalcommits.org/en/v1.0.0/"),
					link("Basic writing and formatting on GitHub", "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"))),
		),
		on(2,
			chore("w1-first-pr", "Open your first pull request",
				`Practise the whole loop on something small before the real tickets start.

### Steps
1. Make sure `+"`main`"+` is up to date with `+"`git pull`"+`.
2. Create a branch.
   `+"```bash"+`
   git switch -c docs/about-me
   `+"```"+`
3. Rewrite `+"`README.md`"+` with a heading with your name, two lines about you and a short list of what this repository will hold.
4. Commit with a clear message and push the branch.
   `+"```bash"+`
   git add README.md
   git commit -m "docs: introduce myself in the README"
   git push -u origin docs/about-me
   `+"```"+`
5. On GitHub, open a PR from `+"`docs/about-me`"+` into `+"`main`"+`. Give it a title and a description of what changed.
6. Don't merge yet. Hand in the PR link and wait for the review.

### Hand in
The PR link.`,
				links(link("Creating a pull request", "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request"),
					link("Git branching basics", "https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging")),
				"Work is on a branch, not on main", "Commit message is clear and in the imperative", "PR has a title and a description",
				"README renders well (heading, short intro, list)"),
			ticket("w1-structure", "Build the portfolio page structure", DeliveryManager, 2,
				`Your portfolio is the first thing a recruiter opens. Today it gets its skeleton, in plain HTML. No frameworks this week.

### What to build
One `+"`index.html`"+` page with these sections, top to bottom.
- A header with your name and links that jump to each section
- **Hero** with a one-line title (for example "Frontend developer in training") and a short intro
- **About** with two or three short paragraphs
- **Projects** with three placeholder cards (title, one-line description, links to code and live demo)
- **Contact** with a form (name, email, message) and links to GitHub and LinkedIn
- A footer

### Acceptance criteria
- Uses semantic elements (`+"`header`"+`, `+"`nav`"+`, `+"`main`"+`, `+"`section`"+`, `+"`footer`"+`), not only `+"`div`"+`s
- One `+"`h1`"+`, and headings in order (`+"`h2`"+` for sections, `+"`h3`"+` for cards)
- Every input has a `+"`label`"+`
- Nav links jump to the right section using `+"`id`"+`s
- Opens without errors from the file or with the VS Code Live Server extension

### Steps
1. `+"`git switch -c feat/structure`"+`
2. Create `+"`index.html`"+`, `+"`styles.css`"+` (empty for now) and link the stylesheet.
3. Write the sections. Commit after each one, for example `+"`feat: add hero section`"+`.
4. Push and open a PR into `+"`main`"+`. Add a screenshot to the description.

### Hand in
The PR link. Styling comes tomorrow, so don't worry about looks yet.`,
				links(link("HTML elements reference", "https://developer.mozilla.org/en-US/docs/Web/HTML/Element"), link("Document and website structure", "https://developer.mozilla.org/en-US/docs/Learn/HTML/Introduction_to_HTML/Document_and_website_structure"),
					link("Your first HTML form", "https://developer.mozilla.org/en-US/docs/Learn/Forms/Your_first_form")),
				"Semantic layout elements are used for every region", "Exactly one h1 and headings in order", "Each form field has a connected label",
				"Nav links jump to each section", "Several small commits with clear messages", "PR description has a screenshot"),
			dsa("dsa-running-sum", "Running sum of an array",
				`Warm-up for the practice pad. Read the problem, write the function, press Run and make every example pass.

### Problem
Given an array `+"`nums`"+`, return a new array where each element is the sum of all elements up to and including that index.

### Examples
`+"```"+`
runningSum([1, 2, 3, 4])  ->  [1, 3, 6, 10]
runningSum([3, 1, 2, 10, 1])  ->  [3, 4, 6, 16, 17]
`+"```"+`

### Aim for
One pass, O(n) time. Don't change the input array.`,
				practice("runningSum", "function runningSum(nums) {\n  // Return a new array of prefix sums.\n}\n",
					"[[1,2,3,4]]", "[1,3,6,10]", "[[1,1,1,1,1]]", "[1,2,3,4,5]", "[[3,1,2,10,1]]", "[3,4,6,16,17]", "[[]]", "[]", "[[-2,5]]", "[-2,3]")),
		),
		on(3,
			ticket("w1-layout", "Make the portfolio responsive with Flexbox and Grid", DeliveryManager, 2,
				`Most people will open your portfolio on a phone. Style yesterday's page so it looks good from 360 px up to a wide desktop.

### What to build
- A mobile-first stylesheet (base styles for phones, then `+"`@media (min-width: ...)`"+` for bigger screens)
- Header and nav laid out with **Flexbox**
- Project cards in a **Grid** that shows one column on phones, two on tablets and three on desktops
- A readable type scale and consistent spacing with CSS custom properties (for example `+"`--space-2`"+` and `+"`--color-text`"+`)
- Visible focus styles for links and buttons

### Acceptance criteria
- No horizontal scrolling at 360 px wide
- Cards use `+"`display: grid`"+` with `+"`gap`"+`, not margins on each card
- Colours and spacing come from custom properties
- Text contrast passes (check with DevTools or a contrast checker)

### Steps
1. Branch `+"`feat/layout`"+` from an up-to-date `+"`main`"+`.
2. Add a reset (`+"`box-sizing: border-box`"+`) and your custom properties.
3. Style phone first, then add one breakpoint at a time. Test with DevTools device mode.
4. Open a PR with two screenshots, phone and desktop.

### Hand in
The PR link.`,
				links(link("Basic concepts of flexbox", "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox"), link("Basic concepts of grid layout", "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout"),
					link("Using CSS custom properties", "https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties"), link("Learn responsive design", "https://web.dev/learn/design")),
				"Looks right at 360 px with no horizontal scroll", "Cards use CSS grid and change columns at breakpoints", "Colours and spacing use custom properties",
				"Focus styles are visible on links and buttons", "PR has phone and desktop screenshots"),
			reading("w1-flex-grid", "Flexbox or Grid, which one when",
				`Read the two MDN guides and play a few levels of Flexbox Froggy or Grid Garden.

### Then write down, in your task notes
- One layout you'd build with Flexbox and why
- One layout you'd build with Grid and why
- What `+"`fr`"+` means in a grid
- The difference between `+"`justify-content`"+` and `+"`align-items`"+``,
				links(link("Basic concepts of flexbox", "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox"),
					link("Basic concepts of grid layout", "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout"),
					link("Flexbox Froggy", "https://flexboxfroggy.com"), link("Grid Garden", "https://cssgridgarden.com"))),
			popQuiz("w1-quiz-git", "Pop quiz on Git basics", EngineeringManager, "Five quick questions on what you did yesterday. You have an hour once it lands.", quiz(
				mcq("What does `git add` do?", 1, "Creates a commit", "Stages changes for the next commit", "Uploads your work to GitHub", "Creates a new branch"),
				mcq("Which command creates a branch and switches to it?", 2, "git branch new", "git checkout main", "git switch -c new-branch", "git commit -b new-branch"),
				mcq("You pushed a branch and opened a PR. A reviewer asks for changes. What do you do?", 0, "Push new commits to the same branch", "Open a new PR from a new branch", "Close the PR and email the code", "Commit straight to main"),
				mcq("What does `git status` show?", 1, "Commit history", "Changed, staged and untracked files", "Remote branches", "Your GitHub profile"),
				mcq("Which is the clearest commit message?", 3, "stuff", "changes", "Updated files", "add contact form validation"),
			)),
			dsa("dsa-missing-number", "Find the missing number",
				`### Problem
An array `+"`nums`"+` holds `+"`n`"+` distinct numbers taken from the range 0 to n. Exactly one number in that range is missing. Return it.

### Examples
`+"```"+`
missingNumber([3, 0, 1])  ->  2
missingNumber([0, 1])  ->  2
missingNumber([9, 6, 4, 2, 3, 5, 7, 0, 1])  ->  8
`+"```"+`

### Aim for
O(n) time and O(1) extra space. Hint, the sum of 0 to n is n(n+1)/2.`,
				practice("missingNumber", "function missingNumber(nums) {\n  \n}\n",
					"[[3,0,1]]", "2", "[[0,1]]", "2", "[[9,6,4,2,3,5,7,0,1]]", "8", "[[0]]", "1", "[[1]]", "0")),
		),
		on(4,
			ticket("w1-projects-js", "Render the projects section from data with JavaScript", DeliveryManager, 2,
				`Hard-coded cards get out of date. Move your projects into a JavaScript array and build the cards from it.

### What to build
- A `+"`projects.js`"+` file exporting an array of objects with `+"`title`"+`, `+"`description`"+`, `+"`tags`"+`, `+"`codeUrl`"+` and `+"`liveUrl`"+`
- A `+"`main.js`"+` that builds one card per project with DOM APIs and adds it to the Projects grid
- Tag buttons above the grid (for example HTML, CSS, JavaScript, React). Clicking one shows only projects with that tag. An "All" button shows everything again.

### Acceptance criteria
- Cards are built with `+"`document.createElement`"+` and `+"`textContent`"+` (no `+"`innerHTML`"+` with data, which can open XSS holes)
- Links to code and live demos open in a new tab with `+"`rel=\"noopener\"`"+`
- The active filter button is highlighted and has `+"`aria-pressed=\"true\"`"+`
- No errors in the console

### Steps
1. Branch `+"`feat/projects-from-data`"+`.
2. Load scripts as modules with `+"`<script type=\"module\" src=\"main.js\"></script>`"+`.
3. Write a `+"`renderProjects(list)`"+` function and call it on load and on every filter click.
4. PR with a short screen recording or two screenshots of the filter working.

### Hand in
The PR link.`,
				links(link("Introduction to the DOM", "https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction"), link("JavaScript modules", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules"),
					link("Array.prototype.filter", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter"), link("Introduction to events", "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events")),
				"Projects live in a data array, not in the HTML", "Cards are built with createElement and textContent", "Tag filter works and All resets it",
				"Active filter has aria-pressed", "External links use target blank with rel noopener", "Console is clean"),
			dsa("dsa-stock", "Best time to buy and sell a stock",
				`### Problem
`+"`prices[i]`"+` is a stock's price on day i. Pick one day to buy and a later day to sell. Return the biggest profit you can make, or 0 if no profit is possible.

### Examples
`+"```"+`
maxProfit([7, 1, 5, 3, 6, 4])  ->  5   (buy at 1, sell at 6)
maxProfit([7, 6, 4, 3, 1])  ->  0
`+"```"+`

### Aim for
One pass. Track the cheapest price so far and the best profit so far.`,
				practice("maxProfit", "function maxProfit(prices) {\n  \n}\n",
					"[[7,1,5,3,6,4]]", "5", "[[7,6,4,3,1]]", "0", "[[2,4,1]]", "2", "[[1]]", "0", "[[3,3,5,0,0,3,1,4]]", "4")),
		),
		on(5,
			ticket("w1-dark-mode", "Add a dark mode that remembers the choice", DeliveryManager, 1,
				`Users expect a site to follow their system theme and let them switch.

### What to build
- A theme toggle button in the header
- Dark colours defined by swapping your custom properties under a `+"`[data-theme=\"dark\"]`"+` selector on `+"`html`"+`
- On first visit, follow the system setting (`+"`prefers-color-scheme`"+`)
- Remember the user's choice in `+"`localStorage`"+` and apply it before the page paints (no white flash)

### Acceptance criteria
- Toggling switches every colour, including form fields and cards
- Reloading keeps the chosen theme
- The button has an accessible name that says what it does, for example "Switch to dark theme"
- Works with keyboard only (Tab to it, Enter or Space to toggle)

### Hint
Put a tiny inline script in `+"`<head>`"+` that reads `+"`localStorage`"+` and sets `+"`data-theme`"+` before the CSS loads.

### Hand in
The PR link, with screenshots in both themes.`,
				links(link("prefers-color-scheme", "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme"), link("Window.localStorage", "https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage"),
					link("Data attributes", "https://developer.mozilla.org/en-US/docs/Learn/HTML/Howto/Use_data_attributes")),
				"Follows the system theme on first visit", "Choice persists after reload with no flash", "Every surface changes, including inputs",
				"Toggle has a clear accessible name and works by keyboard"),
			dsa("dsa-move-zeroes", "Move the zeroes to the end",
				`### Problem
Given an array `+"`nums`"+`, move every 0 to the end while keeping the order of the other numbers. Return the array.

### Examples
`+"```"+`
moveZeroes([0, 1, 0, 3, 12])  ->  [1, 3, 12, 0, 0]
moveZeroes([0])  ->  [0]
`+"```"+`

### Aim for
Do it in place with two pointers, one for the next free slot, in O(n) time.`,
				practice("moveZeroes", "function moveZeroes(nums) {\n  // Rearrange nums in place, then return it.\n  return nums;\n}\n",
					"[[0,1,0,3,12]]", "[1,3,12,0,0]", "[[0]]", "[0]", "[[1,2,3]]", "[1,2,3]", "[[0,0,1]]", "[1,0,0]", "[[4,0,5,0,0,6]]", "[4,5,6,0,0,0]")),
			popQuiz("w1-quiz-css", "Pop quiz on CSS layout", EngineeringManager, "Five questions on Flexbox, Grid and responsive design.", quiz(
				mcq("Which property turns an element into a flex container?", 0, "display: flex", "flex: 1", "position: flex", "align: flex"),
				mcq("In a row flex container, which property spaces items along the row?", 1, "align-items", "justify-content", "grid-gap", "text-align"),
				mcq("What does `grid-template-columns: repeat(3, 1fr)` create?", 2, "Three rows", "One column three times wider", "Three equal-width columns", "A 3 px border"),
				mcq("Mobile-first CSS usually means", 1, "Writing desktop styles first, then max-width media queries", "Base styles for small screens, then min-width media queries", "Hiding content on phones", "Using only percentages"),
				mcq("Which unit scales with the user's root font size?", 3, "px", "vh", "%", "rem"),
			)),
		),
		on(6,
			bug("w1-bug-form", "The contact form sends empty messages",
				`### Bug report
**Reported by** a recruiter who tried to contact you.

> I clicked Send without filling anything in and it said "Thanks, message sent!". I also typed "abc" as my email and that was accepted.

### Expected
- Name, email and message are required
- The email must look like an email
- The message needs at least 20 characters
- Errors show next to the field, in words, and are announced to screen readers
- The success message shows only when everything is valid

### Notes
- Start with built-in HTML validation (`+"`required`"+`, `+"`type=\"email\"`"+`, `+"`minlength`"+`) and then improve the messages with the Constraint Validation API.
- Link each error to its input with `+"`aria-describedby`"+`, and set `+"`aria-invalid=\"true\"`"+` on fields with errors.
- Since there is no backend yet, "sending" can just reset the form and show the success message.

### Hand in
A PR from `+"`fix/contact-validation`"+`. In the description, write the steps you used to reproduce the bug and to check the fix.`,
				links(link("Client-side form validation", "https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation"), link("Constraint validation API", "https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation"),
					link("aria-describedby", "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-describedby")),
				"Empty submit is blocked with a message per field", "Invalid email and short message are rejected", "Errors are linked with aria-describedby",
				"Success shows only after a valid submit", "PR explains how to reproduce and verify"),
			reading("w1-a11y", "Accessibility basics every frontend developer needs",
				`About one in six people lives with a disability. Accessible sites are also easier for everyone.

### Read
The W3C introduction and the web.dev accessibility course modules on keyboard focus and semantics.

### Then try this on your portfolio and note what you find
1. Unplug your mouse. Can you reach and use everything with Tab, Shift+Tab, Enter and Space?
2. Run Lighthouse (DevTools) with only the Accessibility category. Write down your score and each issue it lists.
3. Fix the quick wins now. Keep a list of the rest for tomorrow's ticket.`,
				links(link("Introduction to web accessibility", "https://www.w3.org/WAI/fundamentals/accessibility-intro/"), link("Learn accessibility (web.dev)", "https://web.dev/learn/accessibility"),
					link("Lighthouse overview", "https://developer.chrome.com/docs/lighthouse/overview"))),
			dsa("dsa-palindrome", "Valid palindrome",
				`### Problem
A phrase is a palindrome if, after lowercasing and removing everything that isn't a letter or a digit, it reads the same forwards and backwards. Return true if `+"`s`"+` is a palindrome.

### Examples
`+"```"+`
isPalindrome("A man, a plan, a canal. Panama")  ->  true
isPalindrome("race a car")  ->  false
isPalindrome(" ")  ->  true
`+"```"+`

### Aim for
Two pointers moving inwards, O(n) time and O(1) extra space.`,
				practice("isPalindrome", "function isPalindrome(s) {\n  \n}\n",
					`["A man, a plan, a canal. Panama"]`, "true", `["race a car"]`, "false", `[" "]`, "true", `["No lemon, no melon"]`, "true", `["0P"]`, "false")),
		),
		on(7,
			ticket("w1-deploy", "Ship your portfolio to the internet", DeliveryManager, 1,
				`A portfolio only counts once it has a public link.

### What to do
1. Merge your open PRs into `+"`main`"+` (resolve anything left from reviews first).
2. Deploy with **GitHub Pages** (Settings, then Pages, deploy from the `+"`main`"+` branch). Netlify or Vercel are fine too.
3. Put the live URL in the repository's About box and at the top of your README.
4. Run Lighthouse on the live site (mobile). Aim for 90 or more in Performance, Accessibility, Best Practices and SEO.
5. Fix what you can, in a PR named `+"`chore: lighthouse fixes`"+`. Typical wins are image sizes, a meta description, alt text and contrast.

### Hand in
The link to the PR with your Lighthouse fixes. Put the live URL and your before and after scores in the note.`,
				links(link("Creating a GitHub Pages site", "https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site"),
					link("Lighthouse overview", "https://developer.chrome.com/docs/lighthouse/overview"), link("Netlify docs", "https://docs.netlify.com")),
				"Site is live at a public URL", "Live URL is in the README and the repo About box", "Lighthouse scores before and after are reported",
				"At least two Lighthouse issues fixed in the PR"),
			blog("w1-blog", "Write about your first week",
				`Writing about your work is how people find you. Publish a short post on Hashnode or DEV.

### Cover
- What you built this week, with a link to your live portfolio
- One thing that broke and how you fixed it (paste the actual error)
- One thing you'd do differently

### Guidelines
- 300 to 600 words, your own words, with one or two screenshots
- A title that says what the post is about, not "Week 1"

### Hand in
The link to the published post.`,
				"Published publicly and links to the live portfolio", "Explains a real problem and the fix with specifics", "Clear title and readable structure",
				"Written in the student's own words"),
			standup("w1-retro", "Week one retro",
				`End the week like real teams do.

### Answer in three short parts
- **Went well** this week
- **Was hard** or slowed you down
- **Next week** you'll try to do differently

Next week starts React. If anything from this week is still unclear, say so here.`),
		),
	)
}
