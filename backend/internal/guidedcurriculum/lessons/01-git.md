# A first pull request that someone can review

**Estimated effort:** 75 minutes. **Prerequisite:** your introduction. **Artifact:** a small pull request in a repository you own.

## Core work
1. Create your own portfolio repository on GitHub **with an initial README on the main branch**, then clone it. This existing main commit gives your first PR a real base. There is no private starter repository to find. If Git asks for author identity, configure your own name and email before committing.
2. Create a branch named `chore/intro` before editing.
3. Edit the initial README with the project's intended user, current status, and the next milestone. Record only setup commands that you have actually tried.
4. Create an ignore file appropriate for your tools before staging it. Inspect every staged change before committing.
5. Push the branch and open a PR. Include **what changed**, **why**, and **how you checked it**.

```sh
git switch -c chore/intro
git status
git add README.md .gitignore
git diff --staged
git commit -m "docs: introduce the portfolio project"
git push -u origin chore/intro
```

## Done checks
- The PR changes only the introduction and useful local setup files.
- Someone can identify the project goal and next action from the README.
- No secrets, dependency directories, or generated build output are committed.

## Debug deliberately
If push fails, read the error before retrying. Distinguish a missing remote from an authentication or permission error. Never paste credentials into a help request. If Git identity is missing, configure your own name/email; do not copy another person's identity.

## Hand-in and feedback
Submit the PR link with the commands you verified and one point you want reviewed. After review, make one follow-up commit rather than opening a second PR for the same change.

**Retrieval:** explain the difference between staging, committing, and pushing without reading the commands. **Optional stretch:** inspect a commit with `git show` and explain its diff.
