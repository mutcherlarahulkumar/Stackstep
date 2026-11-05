# Make the change easy to review, then close the loop

**Estimated effort:** 75 minutes. **Prerequisite:** the three capstone slices and regression suite. **Artifact:** a reviewable PR, a triage log and a focused follow-up change.

**Problem:** “Looks good?” makes a reviewer reverse-engineer your intent. Give them an exact journey, then use their observations to improve the product rather than defend every decision.

## Prepare a runnable review · 15 minutes

Use your current capstone PR or create `fix/capstone-review-feedback`. Describe the user problem, changes and exclusions. Include the exact working directory, lockfile install command, start command, test command and starting data. For the Study Queue example:

```text
Start with the three checked-in fixture topics; no account is needed.
1. Select Open; confirm only unfinished topics appear.
2. Add "Array methods"; refresh and confirm it appears once.
3. Complete it while Open is selected; try Undo with the keyboard.
Failure check: use the documented failing-save adapter; typed text must remain.
```

Use your actual fixture titles and failure-control steps, not this template unchanged. Include known limitations, such as browser-only persistence. Remove unrelated formatting changes from the diff.

## Obtain a review you can honestly describe · 20 minutes

Ask an available teammate/lead to attempt the primary journey and leave observations on the PR. If nobody is available, review your own diff after a short break, starting from the README as if you had not written it. Label this **self-review**; do not invent independent approval. Record one question for a later reviewer. This fallback can complete today's practice, but does not substitute for any approval your project requires before merging.

Focus on correctness, data loss and accessibility before cosmetic preferences. A useful comment names a location, observable impact and a suggested next action.

## Triage and respond · 25 minutes

Create `docs/capstone/review-log.md` with columns: finding, evidence/reproduction, severity, decision and verification. Treat loss of typed work as blocking; unclear wording may be a smaller fix; a future account system belongs outside this PR.

Use a respectful response such as:

> I reproduced the missing focus after Complete in the Open filter. I moved focus to the stable Undo action and added a keyboard check. Please retry steps 2–3.

If you disagree, restate the concern, explain your constraint and offer evidence or a smaller alternative. “Out of scope” needs a reason, not a dismissal. A later decision must have an owner or a recorded follow-up, not a silent closed thread.

Fix the highest-impact issue in one focused commit. Run the affected check, then the relevant existing suite. For a self-review, preserve the same finding → change → verification chain.

## Submit and reflect · 15 minutes

Push the follow-up commit and submit the PR link with the log. Summarize resolved blockers, deferred items and their rationale. Ask the reviewer to retry the original reproduction rather than merely inspect the new code.

**Done:** another person can run the change, evidence supports triage, and every blocking comment has a fix or explicit resolution. **Troubleshoot:** if feedback is vague, request an example and expected outcome before changing code. **Reflection:** name one review comment that changed your reasoning, even if you retained the original implementation.
