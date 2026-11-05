# Plan a capstone small enough to finish well

**Estimated effort:** 75 minutes. **Start here:** your product explorer already runs, loads local fixtures and has an automated behaviour test. Open its repository, not the Stackstep repository. Keep its current work intact. You may evolve that project into your capstone; a new repository is optional, not another scaffolding assignment.

**Problem:** a long feature list hides whether anyone can accomplish one useful thing. Today you will replace that list with a three-slice plan and evidence about the problem.

## Make the starting point explicit · 10 minutes

```sh
git status --short
git switch -c docs/capstone-plan
node -p "JSON.stringify(require('./package.json').scripts, null, 2)"
mkdir -p docs/capstone
```

Commit or preserve earlier unfinished work before mixing it into this branch. In `docs/capstone/brief.md`, record the directory, package manager, development command, automated test command and build command that already work. Read the existing README and lockfile: keep its package manager. Do not invent `npm test` if no test script exists; use the working command from day 19.

## Find one concrete problem · 15 minutes

Ask someone about their most recent attempt at a task, rather than whether they like your app idea: “What did you do last time? Where did you lose time? What do you use now?” Record only relevant, non-sensitive observations.

If nobody is available, observe your own next attempt at the task. Label this **self-observation, not a user interview**. Separate observed facts from assumptions. For example: “I copied the same study topics into three notes” is evidence; “all students need my app” is not.

## Define three slices · 30 minutes

Choose your own small problem or this fallback: **Study Queue**, a local list of study topics. Its three slices are:

| Day | Slice | Demonstrable acceptance check |
|---|---|---|
| 23 | Load and filter topics | Given three fixture topics, choosing Open shows only unfinished topics; an empty list explains what to do next. |
| 24 | Add and save a topic | Whitespace-only titles are rejected; a valid title is saved locally; a rejected save preserves the typed title and offers retry. |
| 26 | Complete and undo | Completing a topic updates its status and saved state; undo restores it; both actions work with the keyboard. |

A slice crosses data, UI and a behaviour check. “Build all components” is not a slice. Budget roughly 90–120 minutes per implementation day, including testing. List the state/data shape, one risk and a short Given/When/Then check for each slice. Use stable ids and checked-in fixtures.

Explicitly exclude real sign-in, payments, remote sync, email, a backend and an invented “AI” feature. State that local data stays in this browser and can be lost. If you already have an integration, defer it unless the core journey depends on it.

## Challenge the plan and submit · 20 minutes

Write a two-minute demo script. If it requires an account, a second app or five features before anything works, reduce it. Name what you will cut first when time runs out.

```sh
git add docs/capstone/brief.md
git diff --staged
git commit -m "docs: scope three capstone slices"
git push -u origin docs/capstone-plan
```

Open a PR using your repository's normal workflow. This is a manually reviewed reading/planning task: submit the PR link, or paste the complete brief as a review note if a PR is unavailable. Ask: “Which acceptance check is ambiguous, and which feature would you cut?”

**Done:** evidence is labelled honestly; three slices have observable checks; exclusions and working commands are recorded. **Troubleshoot:** if everything feels essential, pick one user, one situation and one successful action. **Reflection:** what observation changed your scope?
