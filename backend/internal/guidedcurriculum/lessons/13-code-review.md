# Review a change so its author can improve it

**Estimated effort:** 75 minutes. **Prerequisite:** your tested portfolio. If no peer is available, create a small flawed branch of your own and review its diff after a break.

## Core work
1. Read the PR's goal and run its verification steps.
2. Check correctness and user impact before style. Try empty data, a failed operation, keyboard navigation and narrow layout where relevant.
3. Leave two or three focused comments. Each should identify a location, an observable problem and a possible next action.
4. Label a blocker separately from a suggestion or question.
5. Discuss the response, then verify one follow-up fix.

```text
When the selected tag has no projects, this branch removes the reset control.
A keyboard user cannot recover without reloading.
Could we render the labelled reset button inside the empty state?
I checked this with ...
```

## Done checks
Comments include evidence and do not attack the person. At least one issue has a reproduction or example. The author can tell what must change before approval. A later commit or explanation closes the feedback loop.

## Debug the review
If a comment says only “bad naming” or “clean this up,” explain the concrete confusion or maintenance risk. Ask a question when the intended behaviour is unclear instead of assuming your preference is a requirement.

## Hand-in and reflection
Submit the reviewed PR link and one comment you rewrote to be more actionable. Ask the reviewer whether your highest-priority finding protects a real user outcome.

**Optional stretch:** add a small regression test for an accepted review finding.
