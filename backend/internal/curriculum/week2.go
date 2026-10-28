package curriculum

// Week 2 (days 8 to 14). React with Vite, Project 1 is a task manager. Tickets still come
// with guides, now with hints instead of every command.
func week2() []Day {
	return days(
		on(8,
			standup("w2-kickoff", "Week two kickoff",
				`This week you build your first React app, a task manager, one feature a day.

### Tell the team
- What you finished last week and your live portfolio link
- Anything from last week's reviews you still have to fix
- How comfortable you are with JavaScript arrays and objects, from 1 to 5`),
			ticket("w2-scaffold", "Scaffold the task manager with React and Vite", DeliveryManager, 1,
				`### Context
Project 1 is a task manager. Today you set it up and build the screen with fake data. No state yet.

### What to build
- A new public repo `+"`task-manager`"+` created with Vite's React template
- Components `+"`App`"+`, `+"`Header`"+`, `+"`TaskList`"+` and `+"`TaskItem`"+`, each in its own file under `+"`src/components/`"+`
- `+"`TaskList`"+` receives an array of tasks as a prop and renders one `+"`TaskItem`"+` per task
- Each task shows its title, a done checkbox (not wired up yet) and a priority badge (low, medium, high)
- ESLint passing with `+"`npm run lint`"+`

### Steps
`+"```bash"+`
npm create vite@latest task-manager -- --template react
cd task-manager
npm install
npm run dev
`+"```"+`
1. Push the scaffold to `+"`main`"+` as the first commit.
2. Branch `+"`feat/task-list`"+`, build the components with five hard-coded tasks, open a PR.

### Acceptance criteria
- Components are small and named after what they show
- Lists use a stable `+"`key`"+` (the task id, never the array index)
- Props are destructured and named clearly

### Hand in
The PR link.`,
				links(link("Vite getting started", "https://vite.dev/guide/"), link("Your first component", "https://react.dev/learn/your-first-component"),
					link("Passing props to a component", "https://react.dev/learn/passing-props-to-a-component"), link("Rendering lists", "https://react.dev/learn/rendering-lists")),
				"Project created with Vite and runs with npm run dev", "Header, TaskList and TaskItem are separate components", "List keys use the task id",
				"Lint passes", "PR description explains the component tree"),
			reading("w2-thinking-react", "Thinking in React",
				`The single most useful page in the React docs. Read it slowly.

### Then, in your task notes
1. Draw (on paper or in a tool) the component tree for your task manager, the way the article does.
2. List every piece of state the app will need and which component should own each one.
3. Write one sentence on why the filter text should be state but the list of visible tasks should not.`,
				links(link("Thinking in React", "https://react.dev/learn/thinking-in-react"), link("Describing the UI", "https://react.dev/learn/describing-the-ui"))),
			dsa("dsa-contains-duplicate", "Contains duplicate",
				`### Problem
Return true if any value appears at least twice in `+"`nums`"+`, and false if every value is distinct.

### Examples
`+"```"+`
containsDuplicate([1, 2, 3, 1])  ->  true
containsDuplicate([1, 2, 3, 4])  ->  false
`+"```"+`

### Aim for
O(n) time with a `+"`Set`"+`. Then think about how you'd do it with O(1) extra space and what that would cost.`,
				practice("containsDuplicate", "function containsDuplicate(nums) {\n  \n}\n",
					"[[1,2,3,1]]", "true", "[[1,2,3,4]]", "false", "[[1,1,1,3,3,4,3,2,4,2]]", "true", "[[]]", "false", "[[7]]", "false"),
				link("Set", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set")),
		),
		on(9,
			ticket("w2-add-task", "Add tasks with a controlled form", DeliveryManager, 1,
				`### Context
Users can see tasks but can't add any. Time for state.

### What to build
- Move the tasks array into `+"`useState`"+` in `+"`App`"+`
- An `+"`AddTaskForm`"+` with a title input and a priority select, as **controlled inputs**
- Submitting adds a task with a unique id (`+"`crypto.randomUUID()`"+`) to the top of the list and clears the form
- A blank or whitespace-only title is rejected with an inline message
- Pressing Enter submits

### Acceptance criteria
- State is never mutated (use the spread syntax or `+"`map`"+` and `+"`filter`"+` to make new arrays)
- The form component gets an `+"`onAdd`"+` callback as a prop and doesn't know about the list
- The input is labelled and the error is announced (`+"`aria-describedby`"+`)

### Hint
`+"`event.preventDefault()`"+` stops the page from reloading on submit.

### Hand in
The PR link from `+"`feat/add-task`"+`.`,
				links(link("State, a component's memory", "https://react.dev/learn/state-a-components-memory"), link("Updating arrays in state", "https://react.dev/learn/updating-arrays-in-state"),
					link("Reacting to input with state", "https://react.dev/learn/reacting-to-input-with-state")),
				"Inputs are controlled by state", "New tasks get a unique id and appear at the top", "Blank titles are rejected with a visible, announced message",
				"State is updated immutably", "Form receives onAdd and stays unaware of the list"),
			dsa("dsa-anagram", "Valid anagram",
				`### Problem
Given two strings `+"`s`"+` and `+"`t`"+`, return true if `+"`t`"+` uses exactly the same letters as `+"`s`"+`, the same number of times.

### Examples
`+"```"+`
isAnagram("anagram", "nagaram")  ->  true
isAnagram("rat", "car")  ->  false
`+"```"+`

### Aim for
O(n) with a count of each letter (an object or a `+"`Map`"+`). Sorting both strings works too, but costs O(n log n).`,
				practice("isAnagram", "function isAnagram(s, t) {\n  \n}\n",
					`["anagram","nagaram"]`, "true", `["rat","car"]`, "false", `["listen","silent"]`, "true", `["a","ab"]`, "false", `["",""]`, "true")),
			popQuiz("w2-quiz-react", "Pop quiz on React fundamentals", EngineeringManager, "Five questions on components, props and state.", quiz(
				mcq("What should you use as the `key` when rendering a list of tasks?", 2, "The array index", "Math.random()", "A stable id from the data", "Nothing, React handles it"),
				mcq("A child needs to tell its parent that a button was clicked. What's the usual way?", 1, "Change the parent's state directly", "Call a function the parent passed as a prop", "Use a global variable", "Edit the DOM"),
				mcq("Why should you not do `tasks.push(newTask)` on state?", 0, "React compares references, so mutating won't trigger a re-render reliably", "push is slow", "Arrays can't hold objects", "It throws an error"),
				mcq("Which of these is derived data that should NOT be stored in state?", 3, "The text in the search box", "Whether a modal is open", "The list of tasks", "The number of completed tasks"),
				mcq("What does a controlled input mean?", 1, "An input with validation", "An input whose value comes from React state", "An input inside a form", "A disabled input"),
			)),
		),
		on(10,
			ticket("w2-edit-delete", "Complete, edit and delete tasks", DeliveryManager, 1,
				`### What to build
- Ticking the checkbox marks a task done (strike-through and muted)
- A delete button removes the task after a confirm step ("Delete this task?")
- Double-clicking the title, or pressing an Edit button, turns it into an input. Enter saves, Escape cancels, empty is not allowed.
- A counter in the header, for example "3 of 8 done"

### Acceptance criteria
- All updates go through functions in `+"`App`"+` (`+"`toggleTask`"+`, `+"`deleteTask`"+`, `+"`renameTask`"+`) passed down as props
- The done count is computed from the list, not stored separately
- Every button has an accessible name (icon-only buttons get `+"`aria-label`"+`)
- Focus returns to something sensible after editing or deleting

### Hand in
The PR link from `+"`feat/edit-delete`"+`. Include a short screen recording (Loom or a GIF) in the description.`,
				links(link("Sharing state between components", "https://react.dev/learn/sharing-state-between-components"), link("Updating objects in state", "https://react.dev/learn/updating-objects-in-state"),
					link("Responding to events", "https://react.dev/learn/responding-to-events")),
				"Toggle, rename and delete all work and update the counter", "Edit supports Enter to save and Escape to cancel", "Done count is derived, not stored",
				"Icon buttons have accessible names", "Handlers live in App and are passed as props"),
			dsa("dsa-two-sum", "Two sum",
				`The most famous interview question. Learn it properly.

### Problem
Given `+"`nums`"+` and a `+"`target`"+`, return the indices of the two numbers that add up to the target, smaller index first. Exactly one answer exists and you can't use the same element twice.

### Examples
`+"```"+`
twoSum([2, 7, 11, 15], 9)  ->  [0, 1]
twoSum([3, 2, 4], 6)  ->  [1, 2]
`+"```"+`

### Aim for
O(n) with a `+"`Map`"+` from value to index. Explain to yourself why the brute force is O(n²).`,
				practice("twoSum", "function twoSum(nums, target) {\n  \n}\n",
					"[[2,7,11,15],9]", "[0,1]", "[[3,2,4],6]", "[1,2]", "[[3,3],6]", "[0,1]", "[[1,5,8,3],11]", "[2,3]", "[[-1,-2,-3,-4,-5],-8]", "[2,4]"),
				link("Map", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map")),
		),
		on(11,
			ticket("w2-filter", "Filter and search tasks", DeliveryManager, 1,
				`### What to build
- Filter tabs **All**, **Active** and **Done**
- A search box that matches task titles, ignoring case
- Filter and search combine (for example Active tasks containing "report")
- When nothing matches, show a friendly empty state with a button to clear the filters

### Acceptance criteria
- Only the filter and the search text are state. The visible list is computed during render.
- No `+"`useEffect`"+` is used to compute the visible list
- The active tab is clear visually and to screen readers (`+"`aria-pressed`"+` or a proper tab pattern)
- **Stretch** Keep the filter in the URL (`+"`?filter=done`"+`) so a refresh keeps it

### Hand in
The PR link from `+"`feat/filters`"+`.`,
				links(link("Choosing the state structure", "https://react.dev/learn/choosing-the-state-structure"), link("You might not need an effect", "https://react.dev/learn/you-might-not-need-an-effect")),
				"Filters and search combine correctly", "Visible list is derived during render with no effect", "Empty state offers a way to clear filters",
				"Active filter is exposed to assistive tech", "Search ignores case"),
			reading("w2-effects", "Effects, and when you don't need one",
				`Most React bugs in junior code come from effects that shouldn't exist.

### Read
"You might not need an effect" and "Synchronizing with effects" in the React docs.

### Then answer in your notes
1. What is an effect for, in one sentence?
2. Name two things from the article you should compute during render instead.
3. Why does React run effects twice in development?
4. Look at your task manager. Is there an effect you can delete?`,
				links(link("You might not need an effect", "https://react.dev/learn/you-might-not-need-an-effect"), link("Synchronizing with effects", "https://react.dev/learn/synchronizing-with-effects"))),
			dsa("dsa-squares", "Squares of a sorted array",
				`### Problem
`+"`nums`"+` is sorted in non-decreasing order and may contain negatives. Return the squares of each number, also sorted.

### Examples
`+"```"+`
sortedSquares([-4, -1, 0, 3, 10])  ->  [0, 1, 9, 16, 100]
sortedSquares([-7, -3, 2, 3, 11])  ->  [4, 9, 9, 49, 121]
`+"```"+`

### Aim for
O(n) with two pointers at both ends, filling the result from the back. Squaring then sorting is O(n log n).`,
				practice("sortedSquares", "function sortedSquares(nums) {\n  \n}\n",
					"[[-4,-1,0,3,10]]", "[0,1,9,16,100]", "[[-7,-3,2,3,11]]", "[4,9,9,49,121]", "[[1]]", "[1]", "[[-5,-3,-2]]", "[4,9,25]", "[[0,0]]", "[0,0]")),
		),
		on(12,
			ticket("w2-persist", "Keep tasks after a reload with a custom hook", DeliveryManager, 1,
				`### What to build
- A custom hook `+"`useLocalStorage(key, initialValue)`"+` that works like `+"`useState`"+` but saves the value to `+"`localStorage`"+`
- Use it for the task list and the selected filter
- If saved data is missing or broken JSON, fall back to the initial value instead of crashing

### Acceptance criteria
- The hook lives in `+"`src/hooks/useLocalStorage.js`"+`
- Reading happens once, in the lazy initialiser of `+"`useState`"+`
- Writing happens in an effect that depends on the key and the value
- Bad data in storage (try `+"`localStorage.setItem('tasks', 'nope')`"+`) doesn't crash the app

### Hand in
The PR link from `+"`feat/persist`"+`.`,
				links(link("Reusing logic with custom hooks", "https://react.dev/learn/reusing-logic-with-custom-hooks"), link("useState lazy initialiser", "https://react.dev/reference/react/useState#avoiding-recreating-the-initial-state"),
					link("Window.localStorage", "https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage")),
				"Tasks and filter survive a reload", "Hook reads once with a lazy initialiser", "Broken stored JSON falls back safely", "Hook is reusable and in its own file"),
			review("w2-review", "Review a teammate's pull request",
				`Reading other people's code is half the job. A teammate wrote this component and asked you for a review.

### Set up
1. In your `+"`task-manager`"+` repo, create a branch `+"`review/teammate-filter`"+`.
2. Add the file below as `+"`src/review/TaskFilter.jsx`"+`, commit it and open a PR titled "Review practice, TaskFilter".
3. Review the PR on GitHub as if a teammate opened it. Leave **at least four inline comments**, then submit the review with a summary.

`+"```jsx"+`
import { useState, useEffect } from "react";

export default function TaskFilter(props) {
  const [visible, setVisible] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    setVisible(props.tasks.filter(t => t.title.includes(q)));
  });

  return (
    <div>
      <input onChange={e => setQ(e.target.value)} placeholder="search" />
      {visible.map((t, i) => (
        <div key={i} onClick={() => { t.done = !t.done; }}>
          {t.title}
        </div>
      ))}
    </div>
  );
}
`+"```"+`

### A good review
- Points to the exact line and explains **why**, not only what
- Suggests a fix (GitHub's suggestion blocks are great for this)
- Is kind and specific, and separates must-fix from nice-to-have

### Hand in
The PR link with your review on it.`,
				"At least four inline comments on specific lines", "Spots the effect with no dependency array", "Spots the index key and the mutation in onClick",
				"Notes the missing label and case-sensitive search", "Comments explain why and suggest a fix", "Tone is respectful and specific"),
			dsa("dsa-subsequence", "Is it a subsequence",
				`### Problem
Return true if `+"`s`"+` is a subsequence of `+"`t`"+`, meaning you can delete some characters of `+"`t`"+` (or none) without reordering to get `+"`s`"+`.

### Examples
`+"```"+`
isSubsequence("abc", "ahbgdc")  ->  true
isSubsequence("axc", "ahbgdc")  ->  false
`+"```"+`

### Aim for
Two pointers, one in each string, O(n) time.`,
				practice("isSubsequence", "function isSubsequence(s, t) {\n  \n}\n",
					`["abc","ahbgdc"]`, "true", `["axc","ahbgdc"]`, "false", `["","abc"]`, "true", `["abc",""]`, "false", `["ace","abcde"]`, "true")),
		),
		on(13,
			bug("w2-bug-keys", "Edited tasks jump to the wrong row",
				`### Bug report
**Reported by** QA while testing yesterday's build.

> 1. Add three tasks, A, B and C.
> 2. Start editing B, type a few letters but don't save.
> 3. Delete A.
> 4. The half-typed text now sits in the wrong row, and sometimes the wrong task gets renamed.

It also happens after filtering while an edit is open.

### Expected
Each row keeps its own edit state, whatever happens to the rows around it.

### What to do
1. Reproduce it and write the exact steps in the PR description.
2. Find the cause. Hint, look at `+"`key`"+` and at where the edit text is stored.
3. Fix it, then check the steps again, plus filtering while editing.

### Hand in
A PR from `+"`fix/stable-rows`"+` explaining the cause in two or three sentences.`,
				links(link("Preserving and resetting state", "https://react.dev/learn/preserving-and-resetting-state"), link("Rendering lists, keeping list items in order with key", "https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key")),
				"Bug reproduced with exact steps in the PR", "Root cause explained (keys or misplaced state)", "Fix keeps edit state with the right row",
				"Filtering while editing also works"),
			dsa("dsa-group-anagrams", "Group anagrams",
				`### Problem
Group the words that are anagrams of each other. So the answer is easy to check, sort the words inside each group alphabetically, and sort the groups by their first word.

### Examples
`+"```"+`
groupAnagrams(["eat", "tea", "tan", "ate", "nat", "bat"])
  ->  [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]]
`+"```"+`

### Aim for
A `+"`Map`"+` from a key (the sorted letters, or a 26-letter count) to the list of words. O(n · k log k) with sorted keys.`,
				practice("groupAnagrams", "function groupAnagrams(strs) {\n  \n}\n",
					`[["eat","tea","tan","ate","nat","bat"]]`, `[["ate","eat","tea"],["bat"],["nat","tan"]]`, `[[""]]`, `[[""]]`, `[["a"]]`, `[["a"]]`,
					`[["abc","bca","cab","xyz","zyx"]]`, `[["abc","bca","cab"],["xyz","zyx"]]`)),
			popQuiz("w2-quiz-hooks", "Pop quiz on hooks and effects", EngineeringManager, "Five questions. Think about what actually runs, and when.", quiz(
				mcq("An effect with no dependency array runs", 2, "Only once", "Never", "After every render", "Only when props change"),
				mcq("Where should you compute `tasks.filter(t => !t.done)`?", 0, "During render", "In a useEffect that sets state", "In localStorage", "In the constructor"),
				mcq("Which hook would you use to read a value from localStorage only on the first render?", 1, "useEffect", "useState with a lazy initialiser", "useMemo with no deps", "useRef"),
				mcq("Custom hooks must", 3, "Return JSX", "Be classes", "Avoid other hooks", "Start with \"use\" and call hooks at the top level"),
				mcq("Why does React run effects twice in development (Strict Mode)?", 1, "It's a bug", "To surface effects that don't clean up properly", "To make the app faster", "Because of Vite"),
			)),
		),
		on(14,
			ticket("w2-ship", "Polish and deploy the task manager", DeliveryManager, 1,
				`### What to do
1. Merge everything from this week that's been approved.
2. Write a proper README with what it does, a screenshot or GIF, how to run it locally, the tech used and what you'd add next.
3. Deploy to Vercel or Netlify (connect the GitHub repo, framework preset Vite).
4. Add the live link to the README, the repo About box and your portfolio's Projects data.
5. Run Lighthouse on the live app and note the scores.

### Acceptance criteria
- Live URL works on a phone
- README lets a stranger run the project in under five minutes
- Your portfolio now shows the task manager with working links

### Hand in
The PR that updates the README (or the portfolio). Put both live URLs in the note.`,
				links(link("Deploying a static Vite site", "https://vite.dev/guide/static-deploy"), link("Make a README", "https://www.makeareadme.com"), link("Vercel docs", "https://vercel.com/docs")),
				"App is live and works on a phone", "README covers what, run steps, stack and next steps", "Portfolio links to the live app and the code",
				"Lighthouse scores noted"),
			blog("w2-blog", "What React state taught me",
				`### Write about
- How you decided which component owns which state
- A bug you hit (the key bug, an effect loop, a stale value) and how you found it
- One React idea that finally clicked this week

300 to 700 words, with at least one short code snippet and a link to the live task manager.

### Hand in
The link to the published post.`,
				"Published and links to the live project", "Explains a real state decision with reasoning", "Includes a relevant code snippet", "Clear and in the student's own words"),
			standup("w2-retro", "Week two retro",
				`### Answer in three short parts
- **Went well** this week
- **Was hard**
- **Next week** you'll try differently

Next week you'll fetch real data from an API. Also rate your confidence with React state from 1 to 5.`),
		),
	)
}
