# Search state should survive a shared link

**Estimated effort:** 105 minutes. **Prerequisite:** explorer fixtures, adapter and filter behaviour.

## Core work
1. Define URL parameters for query and category. Normalize unknown categories to a documented fallback and read initial controls from the URL.
2. Update the URL when controls change without producing a history entry for every keystroke. State when you choose replace versus push.
3. Restore the UI on back/forward navigation. The URL and controls must agree.
4. Simulate slow request A and faster request B. Ignore or cancel A after B becomes current.
5. Cover copied URL, back/forward and stale-response cases in tests or an exact verification script.

```text
?query=note&category=stationery
A starts: query=pen, delay=500ms
B starts: query=note, delay=50ms
B finishes, then A finishes -> the UI must still show note results
```

## Done checks
A copied URL reconstructs the visible search. The result count agrees with the controls. Old responses cannot overwrite the active search, and retry does not erase the user's context.

## Debugging prompt
Track request identity alongside normalized parameters. If back/forward restores the URL but not the inputs, inspect the source of truth rather than adding another copied state variable. Test category names with spaces using proper URL encoding.

## Hand-in and feedback
Submit the PR and the A/B response trace. Ask a reviewer to navigate back after two searches and compare URL, controls and results.

**Retrieval:** explain why effects should clean up obsolete work. **Optional stretch:** debounce requests while keeping input responsive; do not introduce a delay that hides a race instead of fixing it.
