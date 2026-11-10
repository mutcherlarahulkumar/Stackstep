# Audit a real journey before optimizing it

**Estimated effort:** 105 minutes. **Prerequisite:** a tested product explorer. **Artifact:** a short audit and one verified improvement.

## Core work
1. Choose one important journey: search, inspect results, save a favourite. Use the same fixture and browser conditions for each comparison.
2. Navigate entirely with Tab, Shift+Tab, Enter and Space. Check visible focus and whether focus remains sensible after errors or empty results.
3. Check a 360px viewport, 200% zoom, long titles and simulated slow responses.
4. Measure one slow interaction using browser performance tools. Record what was measured, the device/throttling setting and repeated observations.
5. Fix one demonstrated cause and rerun the identical scenario. Add a regression check for correctness.

## Done checks
The audit records actual outcomes, not boxes ticked without trying the journey. Text is not clipped, controls are labelled and failure states remain recoverable. A performance improvement has before/after evidence under the same conditions; one lucky timing is not a reliable conclusion.

## Debugging prompt
If many cards rerender, first ask whether the interaction is observably slow and whether data/state duplication is causing work. Do not add memoization everywhere. If an automated accessibility tool passes, still check keyboard focus and meaningful labels manually.

## Hand-in and feedback
Submit the PR, audit table and measurement conditions. Ask the reviewer to repeat the most important failed check and verify the fix. State what you did not measure.

**Retrieval:** revisit the overflow bug from day 6 and explain whether the same cause can recur here. **Optional stretch:** automate one stable accessibility check using existing tooling, while retaining the manual journey.
