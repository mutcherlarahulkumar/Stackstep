# Check whether the Git model stuck

**Estimated effort:** 15 minutes. **Prerequisite:** your real first PR; answer from the workflow you used.

## Before you answer
Close your notes and draw three places a change can be: working tree, staging area, and local commit history. Add the remote repository as a fourth place. Explain which command moves information between them.

## Core work
1. Answer the five questions in the app without running commands to search for the answer.
2. Before submitting, write why you chose the answer to the question you find hardest.
3. If you miss one, reproduce the relevant operation in your own small test branch. Do not run destructive cleanup commands on work you need.
4. Retry only after explaining what changed in your understanding. You have three attempts; the best score counts. The answer key becomes visible after the quiz finishes.

## Done checks
You can distinguish staging from committing and pushing from fetching. You understand that a pull request asks for review and merging rather than granting repository permissions. An incorrect answer leads to a specific experiment, not random repeated guesses.

## Debugging prompt
If `git status` says a file is modified after a commit, ask whether you edited it again, whether the intended changes were staged, and which branch you are on. Inspect before attempting to “fix” repository history.

## Hand-in and reflection
Complete the in-app quiz and put one corrected misconception in your task notes. Ask your reviewer to describe a Git situation and explain your next safe inspection command.

**Optional stretch:** distinguish `git fetch` from `git pull` using the idea of inspecting before integrating changes.
