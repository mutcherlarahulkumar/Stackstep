import { expect, test } from "@playwright/test";

import { api, apiToken, signIn, unique } from "./helpers";

type Task = { id: string; version: number };

test.use({ viewport: { width: 1440, height: 900 } });

test("practice pad: runs examples in the browser, stops endless loops, hands in the code (DP2, DP4–DP6)", async ({ page, request }) => {
  const title = unique("Sum of two");
  const admin = await apiToken(request, "admin-demo");
  const students = await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=ravi");
  const enrollment = students.items[0]?.enrollment.id ?? "";
  await api<Task>(request, admin, "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "dsa",
    title,
    brief: "Return a + b.",
    due_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    content: {
      resources: [],
      quiz: null,
      practice: { function_name: "add", starter: "function add(a, b) {\n}\n", tests: [{ args: [1, 2], expected: 3 }, { args: [-1, 1], expected: 0 }] },
    },
  });

  await signIn(page, "ravi-dev");
  await page.getByRole("region", { name: "Task board" }).getByRole("button", { name: title }).click();
  const pad = page.getByTestId("practice-pad");
  const code = pad.getByTestId("practice-code");
  await expect(pad).toContainText("add(1, 2) → 3");

  // The starter returns undefined: both fail, with what came back.
  await pad.getByTestId("practice-run").click();
  await expect(pad.getByTestId("practice-summary")).toHaveText("0 of 2 examples pass");
  await expect(pad.getByTestId("practice-case-0")).toContainText("got undefined");

  // An endless loop is stopped, not frozen.
  await code.fill("function add(a, b) { while (true) {} }");
  await pad.getByTestId("practice-run").click();
  await expect(pad.getByTestId("practice-case-0")).toContainText("Stopped after 3 seconds", { timeout: 8000 });

  // The network is off inside the pad.
  await code.fill("function add(a, b) { return typeof fetch; }");
  await pad.getByTestId("practice-run").click();
  await expect(pad.getByTestId("practice-case-0")).toContainText("got undefined");

  // A syntax error is explained once.
  await code.fill("function add(a, b) { return a + }");
  await pad.getByTestId("practice-run").click();
  await expect(pad.getByRole("alert")).toContainText("SyntaxError");

  // Correct, via keyboard: Ctrl+Enter runs.
  await code.fill("function add(a, b) {\n  console.log('adding', a, b);\n  return a + b;\n}");
  await code.press("Control+Enter");
  await expect(pad.getByTestId("practice-summary")).toHaveText("All 2 examples pass");
  await expect(pad.getByText("Console (2)")).toBeVisible();

  // The draft survives a reload, and the code goes into the hand-in.
  await page.reload();
  await page.getByRole("region", { name: "Task board" }).getByRole("button", { name: title }).click();
  await expect(page.getByTestId("practice-code")).toHaveValue(/return a \+ b;/);
  await page.getByTestId("move-in_progress").click();
  await page.getByTestId("move-in_review").click();
  await page.getByTestId("insert-practice").click();
  await expect(page.getByLabel("Solution or note")).toHaveValue(/all 2 examples pass[\s\S]*return a \+ b;/);
});
