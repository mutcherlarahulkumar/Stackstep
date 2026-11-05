# Tests should protect behaviour someone depends on

**Estimated effort:** 90 minutes. **Prerequisite:** portfolio filters and contact validation. The Vite scaffold does not include this test setup by default; add it once in `react-portfolio/` as shown below. Keep the resulting lockfile.

## One-time test setup

```sh
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm pkg set 'scripts.test=vitest run'
```

In `vite.config.ts`, import `defineConfig` from `vitest/config` instead of `vite`, keep the existing React plugin, and add:

```ts
test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] }
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
```

Place tests beside components as `*.test.tsx`, import `test`/`expect` from `vitest`, and run `npm test`. Also run the scaffold's `npm run build` and `npm run lint`; a passing test is not a type check.

## Core work
1. Write a short risk list. Select combined filters, no-match reset and invalid contact submission.
2. Arrange a small deterministic dataset. Act through labelled inputs and buttons. Assert observable results.
3. Cover one failed-load or failed-submit state using an adapter whose outcome you control.
4. Prove at least one test is useful: temporarily break the relevant behaviour, observe the expected failure, and restore the implementation before committing.
5. Make tests independent; reset mocks and do not rely on execution order.

```text
Given frontend projects A and B and backend project C
When I choose frontend and search for B's title
Then only B is shown and the result count is 1
```

## Done checks
A removed AND condition makes the filter test fail. Empty results offer a working reset. Validation errors are associated with the right field. Tests query by accessible role/label where possible rather than private component state or brittle CSS.

## Debugging prompt
A flaky delay is usually a missing state condition, not a reason to add a longer sleep. Wait for the expected UI event. If a test passes even when its feature is removed, strengthen the assertion.

## Hand-in and feedback
Submit the PR with the three protected behaviours, commands executed, and one demonstrated red-to-green result. Ask a reviewer which important failure remains untested.

**Optional stretch:** add the highest-risk missing test; a coverage percentage alone is not the objective.
