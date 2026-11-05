# Ship one useful journey from data to screen

**Estimated effort:** 120 minutes, including checks and PR preparation. **Prerequisite:** your day 22 brief, a runnable React project with existing test tools, and the decision log. Use the recorded working directory and commands. Today is slice one, not all three slices.

**Problem:** a user should accomplish something with your capstone before every screen exists. For the Study Queue fallback, they can load topics and narrow the list to unfinished work.

## Core work: Protect the baseline · 15 minutes

```sh
git status --short
git switch -c feat/capstone-first-slice
node -p "JSON.stringify(require('./package.json').scripts, null, 2)"
```

Start the project and run its existing checks using your brief. If these fail before your change, reproduce and resolve that prerequisite first. Reuse the working explorer structure; do not replace its toolchain. Preserve the earlier project milestone in Git. Write today's one acceptance scenario before editing components.

## Define a tiny data boundary · 15 minutes

For Study Queue, create a local fixture in the existing source folder, for example `src/data/topics.js` (use `.ts` if your project already uses TypeScript):

```js
export const topics = [
  { id: "arrays", title: "Array methods", status: "open" },
  { id: "forms", title: "Accessible forms", status: "completed" },
  { id: "async", title: "Async requests", status: "open" },
];
```

The contract is a unique nonempty string id, a nonblank title and status `open` or `completed`. Keep fixture loading behind one adapter so tests can supply empty or failed results. Do not import a network service or add sign-in. If using your own capstone idea, write an equally small shape and fixture.

## Implement the narrow path · 55 minutes

Render a heading, labelled status control, result count and list. Store the chosen filter, then derive visible items; do not maintain a second list in state. Use ids as React keys. Plain text stays text, including a title that contains `<script>`.

Start with All/Open/Completed. The same rule should drive the list and its count. Add an empty message that distinguishes “no topics exist” from “none match this filter,” with a working reset for the latter. Keep loading/failure handling as simple as your adapter requires; defer adding and editing until the planned later slices.

Use ordinary links for navigation and buttons for actions. Tab through every control. Test a long title and 360px viewport before polishing colours.

## Prove one behaviour · 20 minutes

Using the test framework already installed on day 19, render the fixture, select Open through its accessible label and assert that Array methods and Async requests appear while Accessible forms does not. Then test the empty fixture manually. Record the exact command and result in the PR. If the count disagrees with the cards, check whether both use the same derived array.

## Hand-in and feedback: Submit the smallest reviewable change · 15 minutes

Inspect `git diff`, stage only the fixture, UI, relevant test and brief update, then commit and push this branch. Open a PR with the starting command, fixture, four reproduction steps, test result and screenshot. State which two slices remain intentionally unfinished. Submit the PR link as the hand-in; ask the reviewer to try an empty fixture and find one unclear label.

## Done checks

 a user completes slice one; the data contract is explicit; an automated behaviour check passes; no unrelated features obscure the diff. **Reflection:** which part of your explorer experience transferred, and which assumption needed changing? Stop at the timebox and document a reduced but complete slice if necessary.

**Optional stretch:** Add one test for a boundary value that is plausible for your chosen user. Skip this when the core timebox is used.
