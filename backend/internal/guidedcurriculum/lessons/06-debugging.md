# Fix a layout regression through experiments

**Estimated effort:** 90 minutes. **Prerequisite:** hero, project grid, and reproducible-question practice.

## Core work
1. Find one real layout failure at 360px, 200% zoom, or with long content. If none is visible, intentionally add a long unbroken project title on a local branch to probe the layout.
2. Record expected/actual behaviour and the smallest reproduction before changing CSS.
3. List two possible causes. Change one variable at a time in developer tools and note the results.
4. Fix the demonstrated cause in a small `fix/...` branch.
5. Retest the original case, a wide viewport, keyboard focus and normal-length content.

```text
Hypothesis: the card's minimum width exceeds its container.
Experiment: set min-width: 0 on the specific flex item.
Observation: ...
Conclusion and remaining uncertainty: ...
```

## Done checks
The PR contains before/after evidence and a repeatable regression check. The fix does not merely clip meaningful content with `overflow: hidden`. Unrelated styling changes are excluded.

## If you get stuck
Inspect computed widths and parent constraints. Check whether a child has an intrinsic width, an image without a width constraint, or a long code block. Ask for help using yesterday's question format after 20 focused minutes without new evidence.

## Hand-in and feedback
Submit the PR, reproduction and one rejected hypothesis. Ask a reviewer to verify both the failing case and a case you expect to remain unchanged.

**Retrieval:** explain why an attractive screenshot alone cannot prove the bug is fixed. **Optional stretch:** automate a viewport check if you already know the test tooling; learning a new framework is not required today.
