# Save honestly and keep work recoverable

**Estimated effort:** 105 minutes. **Prerequisite:** slice one's list/filter journey and behaviour test pass. Use your existing capstone adapter and day 22 commands. **Artifact:** slice two with validation, truthful save feedback and a demonstrated failure.

**Problem:** “Saved!” is a promise. If storage fails while a student adds a topic, the app must not lose their writing or show an unconfirmed item as permanently saved.

## Core work: Specify the operation · 15 minutes

Create `feat/capstone-recoverable-save` from the reviewed baseline. For Study Queue, Add topic accepts a trimmed nonblank title of at most 80 characters. A successful add receives a stable id and status `open`; duplicate titles may be allowed, but ids stay unique. Document your choice. Define the title limit and validation in one place.

Write three states before coding:

```text
idle: title editable, submit available
saving: one operation in progress, duplicate submits blocked
failed: typed title retained, error explained, retry available
success: confirmed item appears; form clears only after confirmation
```

Use a labelled input and an associated field error. A live status message may announce completion; do not move focus unexpectedly when a save succeeds.

## Add the slice behind an adapter · 40 minutes

Reuse the local persistence pattern from day 17. Save confirmed topics as non-sensitive JSON, and load/validate them when the app starts. Catch storage access, JSON parse and write errors. A readable saved list can be restored; malformed data should produce a documented recovery choice rather than a crash or a silent false success.

To test saving, inject a fake adapter that waits and then rejects. A simple test double can use:

```js
const failingStore = {
  load: async () => [],
  save: async () => { throw new Error("simulated write failure"); },
};
```

Adapt its method names to your existing interface. Keep fault controls in tests or a clearly marked demo mode. Do not break real browser storage globally to simulate failure.

## Walk the difficult paths · 30 minutes

Try whitespace-only input, a title above the limit, a valid title and two rapid submits. While saving, the interface must not create two entries. On rejection, preserve the typed title and confirmed list. Retry with a working adapter and confirm exactly one new entry.

Reload after success: the confirmed item returns. Reload during a pending write: state exactly what survives. Losing an unsaved draft on reload is acceptable if clearly documented; do not claim offline sync or draft recovery you have not built. If a late response overwrites newer work, trace request identity and confirmed versus pending state.

## Hand-in and feedback: Submit and ask for a failure review · 20 minutes

Run the recorded tests/build checks. Open a focused PR containing slice two, its adapter tests and the documented recovery policy. Include success, failure, retry and reload steps plus one screenshot of retained text after failure. Submit the PR link. Ask a reviewer to interrupt a save and challenge whether every displayed claim remains true.

## Done checks

 slice two passes its acceptance checks; errors are actionable; invalid input never saves; failed saves preserve recoverable work. **Reflection:** what is the difference between visible, pending and durably saved data in this local demo?

**Optional stretch:** Repeat the journey with a deliberately rejected save and explain why retry cannot duplicate work. Skip this when the core timebox is used.
