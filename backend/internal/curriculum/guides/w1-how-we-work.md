# How work flows on this team

Every task in this internship follows the same loop that real software teams use. Learn it
once and every ticket after this one feels familiar.

## The loop, end to end

1. **A ticket lands.** It shows up on your board and the person who assigned it mentions it in
   chat. Read the brief and the review checklist before you touch any code.
2. **You branch.** Never work on `main`. Create a branch named after the work.
3. **You commit small.** Each commit does one thing and says what it does.
4. **You push and open a pull request.** The PR explains what changed and how to check it.
5. **You hand in the PR link.** The task moves to *Waiting for review*.
6. **Someone reviews.** They approve, or they request changes with notes. You fix, push to the
   same branch and hand in again.

```bash
git switch main
git pull
git switch -c feat/hero-section
# make the change, then
git add src/Hero.tsx
git commit -m "Add the hero section with a call to action"
git push -u origin feat/hero-section
```

> [!TIP]
> Good branch names start with what kind of change it is. `feat/` for something new, `fix/`
> for a bug, `docs/` for writing, `chore/` for housekeeping.

## Writing a pull request people want to review

A reviewer should understand your PR in under a minute. Use this shape.

```markdown
## What
Adds the hero section on the home page with a headline and a Contact button.

## Why
Ticket "Build the hero section". Visitors need a clear first message.

## How to check
1. npm run dev and open the home page
2. Resize to 360 px wide. No sideways scrolling.
3. Tab to the button. The focus ring is visible.

## Screenshots
Phone and desktop.
```

> [!IMPORTANT]
> Only list checks you actually ran. Reviewers will run them too, and an honest "I could not
> test X because Y" is far better than a claim that turns out false.

## Talking to your team

- **Ask early, ask well.** After a focused 25 minutes stuck, ask. Say what you tried, what you
  expected and what happened, with the exact error.
- **Post standups.** One line each for yesterday, today and anything blocking you.
- **Answer review comments.** Fix it, or explain why not. Do not silently ignore one.

> [!WARNING]
> Never force-push over a branch someone is reviewing, and never commit straight to `main`.
> Both make reviews harder and can lose work.

## Checklist before you hand in

- [ ] The branch is up to date with `main`
- [ ] The PR description has What, Why and How to check
- [ ] You ran every check you listed
- [ ] Screenshots for anything visual
