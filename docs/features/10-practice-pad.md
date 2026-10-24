# Feature 10 — DSA practice pad (in-browser self-check)

Students write a JavaScript solution in the task panel and run it against the admin's example
tests before handing in. We weighed a server-side judge and chose not to build one:

- **Safety**: running untrusted code on our servers needs a hardened sandbox; running it in the
  student's own browser (a Web Worker) only affects their own tab.
- **Honesty**: results are a self-check, labelled as such. The reviewer reads the code.
- **Cost**: no compute, no queue, works offline once the page is open.

## How it works

- Admins add an optional **practice pad** to DSA tasks (assign form, library, flows): a function
  name, starter code and 1–10 example tests (arguments as a JSON array, expected result as JSON).
  Tests are data, never code.
- The student's code runs in a module Web Worker with `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, `importScripts`, `indexedDB`, `caches` and `BroadcastChannel` removed. The page
  stops the worker after **3 seconds** (endless loops) and marks unfinished examples as timed out.
- Results compare JSON values with object keys sorted. `console.log` output is shown (50 lines).
- The draft is kept in this browser (localStorage) on every change.
- "Insert my practice code" in the hand-in puts the code in a fenced block with the result line,
  trimmed to the 4,000-character note limit.
- App: shows the examples and links to the web app to run them.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| DP1 | JSON stored compact; JS name rules; 1–10 tests; size caps | validation per field | domain `TestValidatePractice`, web `content.test.ts` |
| DP2 | Practice on a DSA task | student receives the tests (web and app) | backend `TestPracticeContent`, Flutter `models_test.dart` |
| DP3 | Practice on a non-DSA task | 422 `content.practice` | backend, web `content.test.ts` |
| DP4 | Wrong answer, key order, `undefined` | fail with "got …"; `{a,b}` equals `{b,a}` | web `practice.test.ts`, E2E `practice.spec.ts` |
| DP5 | Endless loop; syntax error; `fetch` inside the pad | stopped at 3 s; one error message; `fetch` is undefined | E2E `practice.spec.ts` |
| DP6 | Reload; hand-in | draft restored; note contains code and result, ≤ 4,000 chars | E2E, web `practice.test.ts` |
