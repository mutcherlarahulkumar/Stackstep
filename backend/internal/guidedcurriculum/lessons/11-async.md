# Async loading has more than a happy path

**Estimated effort:** 105 minutes. **Prerequisite:** state and the React checkpoint. **Artifact:** a deterministic local loader and visible loading/error/empty/success states.

## Core work
1. Use checked-in project data through an asynchronous adapter. Its normal, empty, delayed and rejected behaviours must be reproducible without an outside API.
2. Represent state explicitly. Do not show old data as a successful answer to a failed new request.
3. Start loading, render a useful status, then handle success or an actionable error with retry.
4. Prevent obsolete work from updating the current view. Use cancellation when the adapter supports it, or an active request identity when it does not.
5. Preserve the user's selected filters through retry.

```js
const request = ++latestRequest.current;
try {
  const items = await loadProjects();
  if (request === latestRequest.current) setResult({ status: "success", items });
} catch (error) {
  if (request === latestRequest.current) setResult({ status: "error" });
}
```

## A deterministic adapter to start from

Keep the existing project array in `src/data/projects.ts`. A local adapter can expose explicit scenarios; use temporary development controls or tests to select them:

```ts
import { projects } from "../data/projects";
type Mode = "success" | "empty" | "error";
export function loadProjects(mode: Mode = "success", delayMs = 200) {
  return new Promise<typeof projects>((resolve, reject) => {
    setTimeout(() => {
      if (mode === "error") reject(new Error("Simulated load failure"));
      else resolve(mode === "empty" ? [] : structuredClone(projects));
    }, delayMs);
  });
}
```

The adapter intentionally does not cancel its timer, so the UI must ignore obsolete results. In an effect's cleanup invalidate the active request identity (or set an `ignore` flag); also invalidate it before a new request. Do not mistake simulated success for data from a real service.

## Done checks
You can demonstrate every state on demand. Unmounting or replacing a request does not let an old response overwrite a newer one. Retry does not duplicate records or clear filters. Error copy explains a next action without exposing a raw stack trace.

## Debug and hand-in
Delay request A longer than request B and record which response the UI accepts. Submit the PR with that trace and evidence for all four states. Ask a reviewer to try navigating away during a delay.

**Retrieval:** why is an effect cleanup useful here? **Optional stretch:** support cancellation with AbortController if the underlying loader can honor its signal.
