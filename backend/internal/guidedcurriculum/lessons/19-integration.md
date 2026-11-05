# Protect the explorer's difficult journeys

**Estimated effort:** 90 minutes. **Prerequisite:** URL search, failed-write handling and validation boundaries.

## Core work
1. Write integration tests for stale search responses, a failed favourite write and malformed product data.
2. Inject deterministic adapters so tests choose response timing and failures instead of relying on live services.
3. Add one browser-level happy path: open a shareable URL, inspect results, favourite an item and reload.
4. Demonstrate one red-to-green regression by temporarily restoring the old flawed behaviour, observing failure, then restoring the fix.
5. Check tests pass alone and together; shared fixture mutations must be reset.

```text
Arrange A's response unresolved, start B, resolve B, then resolve A.
Assert the displayed results still belong to B.
```

## Local browser-test setup

From `product-explorer/`:

```sh
npm install -D @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts` (and keep browser tests in `e2e/`):

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
```

In the Vitest config from day 12, set `test.include` to `["src/**/*.test.{ts,tsx}"]` so Vitest does not collect `e2e/` tests. Browser specs import `test` and `expect` from `@playwright/test`; unit tests import them from `vitest`. Run `npm test` for unit/integration checks and `npx playwright test` for browser checks. Keep both in the project's lockfile.

If a managed machine blocks browser downloads, record the exact environment blocker and perform the happy path manually while requesting the supported browser setup. Do not disable certificate verification or describe unrun browser tests as passed.

## Done checks
Each test verifies a real user-visible outcome. Failure assertions distinguish truthful state from optimistic UI that never rolls back. The browser journey uses real controls, not private component methods. Test output identifies which behaviour failed.

## Debugging prompt
If race tests depend on arbitrary sleeps, use controllable promises or adapter responses. If tests only assert that a mock was called, add an assertion about what the person sees afterward.

## Hand-in and feedback
Submit the test PR, executed commands and the demonstrated failure-before-fix. Ask a reviewer to remove one assertion and explain whether the test would still protect the original bug.

**Optional stretch:** add one additional failure from your real bug history, not a duplicate of an implementation detail.
