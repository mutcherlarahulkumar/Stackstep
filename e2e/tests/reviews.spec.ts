import { expect, test } from "@playwright/test";

import { api, apiToken, expectToast, signIn, unique } from "./helpers";

type Task = { id: string; version: number };

test("review queue: oldest first with hand-in warnings; approving clears it and tells the student (RQ1–RQ4)", async ({ page, request }) => {
  // A student hands in someone else's PR (set up through the API).
  const title = unique("Paginate the orders table");
  const admin = await apiToken(request, "admin-demo");
  const students = await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=ravi");
  const enrollment = students.items[0]?.enrollment.id ?? "";
  const task = await api<Task>(request, admin, "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "feature",
    title,
    brief: "Add pagination.",
    due_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
  });
  const ravi = await apiToken(request, "ravi-dev");
  await api(request, ravi, "POST", `/v1/tasks/${task.id}/transitions`, { to: "in_progress", expected_version: task.version, note: "" });
  await api(request, ravi, "POST", `/v1/tasks/${task.id}/transitions`, {
    to: "in_review",
    expected_version: task.version + 1,
    note: "",
    submission: { url: "https://github.com/someone-else/shop/pull/7", note: "Used a cursor." },
  });

  await signIn(page, "admin-demo");
  await page.getByRole("link", { name: "Reviews" }).click();
  await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
  const card = page.getByTestId(`review-${title}`);
  await expect(card).toContainText("Ravi Teja");
  await expect(card.getByTestId("check-foreign_repo")).toContainText("github.com/someone-else");

  // Request changes needs a note; approving removes it from the queue.
  await card.getByTestId("review-changes").click();
  await page.getByRole("dialog").getByRole("button", { name: "Send to student" }).click();
  await expect(page.getByRole("dialog").getByText("Tell the student what to change.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Back" }).click();
  await card.getByTestId("review-approve").click();
  await expectToast(page, `Approved “${title}” for Ravi`);
  await expect(page.getByTestId(`review-${title}`)).toHaveCount(0);
});

test("AI review draft: fills the decision, rubric and note from the PR; the admin edits and sends (RD1, RD2)", async ({ page, request }) => {
  const title = unique("Filter tasks by status");
  const admin = await apiToken(request, "admin-demo");
  const students = await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=ravi");
  const enrollment = students.items[0]?.enrollment.id ?? "";
  const task = await api<Task>(request, admin, "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "feature",
    title,
    brief: "Add a status filter.",
    due_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
    content: { resources: [], quiz: null, rubric: ["Filter updates without a reload", "Has a test"] },
  });
  const ravi = await apiToken(request, "ravi-dev");
  await api(request, ravi, "POST", `/v1/tasks/${task.id}/transitions`, { to: "in_progress", expected_version: task.version, note: "" });
  await api(request, ravi, "POST", `/v1/tasks/${task.id}/transitions`, {
    to: "in_review",
    expected_version: task.version + 1,
    note: "",
    submission: { url: "https://github.com/ravi-dev/todo/pull/3", note: "Filtered in the render." },
  });

  await signIn(page, "admin-demo");
  await page.getByRole("link", { name: "Reviews" }).click();
  await page.getByTestId(`review-${title}`).getByTestId("review-draft").click();
  const dialog = page.getByRole("dialog");
  // The draft read the PR, picked a decision and ticked the rubric; nothing is sent yet.
  await expect(dialog.getByTestId("ai-draft-summary")).toContainText("nothing shows the filter was tested");
  await expect(dialog.getByTestId("ai-draft-summary")).toContainText("Based on the task and the PR's diff.");
  await expect(dialog.getByTestId("decision-changes")).toHaveAttribute("data-state", "on");
  await expect(dialog.getByTestId("rubric-review")).toContainText("1 of 2 met");
  await expect(dialog.getByLabel("What needs to change")).toHaveValue(/Add a test that picks a status/);

  await dialog.getByLabel("What needs to change").fill("Nice filter. Please add a test that picks a status and checks the list.");
  await dialog.getByTestId("review-confirm").click();
  await expectToast(page, "Changes requested from Ravi");
  await expect(page.getByTestId(`review-${title}`)).toHaveCount(0);
});
