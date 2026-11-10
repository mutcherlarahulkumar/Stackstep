# Turn the riskiest journeys into a regression safety net

**Estimated effort:** 90 minutes. **Prerequisite:** capstone slices one and two, controllable data/save adapters and the existing test runner. **Artifact:** three meaningful automated checks plus one reproducible bug report.

**Problem:** a passing test count does not help if an important user journey can break unnoticed. Choose tests by likely harm, then prove one would detect a real regression.

## Core work: Choose three risks · 10 minutes

Create `test/capstone-regressions`. List three outcomes a person relies on. For Study Queue, use:

1. Selecting Open excludes completed topics and the result count agrees.
2. A failed Add keeps the typed title, shows a retry action and does not add a phantom topic.
3. After a successful Add and reload/remount, the topic returns exactly once.

If your app differs, choose equivalent read, failed-write and recovery risks. These tests protect existing slices; you do not need slice three yet. Write Given/When/Then scenarios before opening the test file.

## Arrange, act, assert · 35 minutes

Use the installed framework and accessible queries already used on day 19. Provide a fresh fixture/store for each test; clear only the test's local storage key or inject an in-memory adapter. A test must not depend on the preceding test having saved something.

For a failed save, hold the save promise pending, submit through the real control, assert the saving state, reject the promise and assert retained text plus the failure message. Resolve a retry and check one confirmed entry. Wait for a visible state, not an arbitrary sleep.

```text
Given the title "Array methods" is typed and the store rejects writes
When Save is activated
Then an error and retry path appear
And the title remains in the input
And the confirmed list contains no new topic
```

For reload, remount the app with the same adapter contents, or reload in your existing browser test harness. Do not assert only that a save mock was called; inspect the resulting interface and restored data.

## Demonstrate a test failure · 20 minutes

Reproduce one actual defect discovered while checking these journeys. If none appears, deliberately reintroduce a plausible regression, such as clearing the title before save succeeds. Label it **injected regression**, not a discovered production bug. Run only the relevant test, confirm its expected assertion fails, restore the correct code and run it again. Never commit the deliberately broken variant.

Create `docs/capstone/bug-report.md` with the commit, starting data, exact steps, expected/actual result, cause and verification. Mark injected faults honestly. A useful reproduction should let someone else observe the same failure without guessing your browser state.

## Hand-in and feedback: Run and submit · 25 minutes

Run the three tests individually, then the existing suite together with its documented command. Check every intended test executed; a skipped or zero-test result is not a pass. Fix leaked state instead of adding retries.

Open a PR with the tests and report, commands/results and the specific red-to-green observation. Submit its link. Ask the reviewer which one important assertion they could remove before the original regression escapes.

## Done checks

 three user outcomes are protected, failure-before-fix is demonstrated, and the report is reproducible. **Troubleshoot:** a test that stays green when its feature is removed is observing the wrong thing. **Reflection:** which risk is still manual, and why is that reasonable today?

**Optional stretch:** Turn one additional real bug from your notes into a focused regression test. Skip this when the core timebox is used.
