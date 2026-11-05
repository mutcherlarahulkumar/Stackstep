# A favourite toggle is a small distributed state problem

**Estimated effort:** 90 minutes. **Prerequisite:** explorer async states and adapter boundaries. Use a local persistence adapter; no account service is required.

## Core work
1. Define how favourite ids are loaded and saved. A localStorage adapter may store only this non-sensitive demo preference.
2. Choose a clear pending strategy: disable the current operation or model one pending mutation per item.
3. Simulate a rejected write. Either keep the last confirmed state until success or optimistically change it and roll back on failure.
4. Add retry without silently duplicating work.
5. Handle malformed saved JSON and unknown product ids with a documented safe fallback.

```text
confirmed=false -> saving=true -> write fails
UI returns to confirmed=false and explains how to retry
```

## Done checks
Rapid clicks cannot create conflicting writes for the same item. Failed writes do not display a false saved state. Reload restores confirmed favourites. Corrupted local storage does not crash the app. The UI remains usable without assuming local storage is always available.

## Hand-in and feedback: Debug and hand-in
Trace desired, pending and confirmed state for one failure. If state flips twice unexpectedly, check whether the event was submitted twice or stale asynchronous work was accepted. Submit the PR with success, failure, retry and reload evidence.

**Retrieval:** compare this write path with the contact-form submit state. Ask a reviewer which state the user should see during failure. **Optional stretch:** test two tabs and document the synchronization policy; do not claim cross-device persistence.
