import { expect, test } from "@playwright/test";

import { api, apiToken, expectToast, signIn, unique } from "./helpers";

type Task = { id: string; version: number };

test("rubric: admin writes it, the student sees it, the reviewer ticks it, the student sees the result (RB1–RB4)", async ({ browser, request }) => {
  const title = unique("Add a dark mode toggle");
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByTestId("student-meera-dev").click();
  await admin.getByTestId("open-assign").click();
  await admin.getByLabel("Title").fill(title);
  await admin.getByTestId("assign-more").click();
  await admin.getByTestId("assign-rubric-add").click();
  await admin.getByLabel("Criterion 1", { exact: true }).fill("ok");
  await admin.getByTestId("assign-rubric-add").click();
  await admin.getByLabel("Criterion 2", { exact: true }).fill("Remembers the choice after reload");
  await admin.getByTestId("assign-submit").click();
  await expect(admin.getByText("Write the criterion (at least 3 characters).")).toBeVisible();
  await admin.getByLabel("Criterion 1", { exact: true }).fill("Respects the system setting");
  await admin.getByTestId("assign-submit").click();
  await expectToast(admin, `Assigned “${title}”`);

  // The student sees what will be checked, then hands in (through the API to keep this short).
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "meera-dev");
  const board = student.getByRole("region", { name: "Task board" });
  await board.getByRole("button", { name: title }).click();
  await expect(student.getByTestId("rubric")).toContainText("What your reviewer checks");
  await expect(student.getByTestId("rubric")).toContainText("Remembers the choice after reload");
  const tok = await apiToken(request, "meera-dev");
  const tasks = await api<{ items: (Task & { title: string })[] }>(request, tok, "GET", "/v1/me/tasks");
  const t = tasks.items.find((x) => x.title === title);
  if (!t) throw new Error("task missing");
  await api(request, tok, "POST", `/v1/tasks/${t.id}/transitions`, { to: "in_progress", expected_version: t.version, note: "" });
  await api(request, tok, "POST", `/v1/tasks/${t.id}/transitions`, {
    to: "in_review",
    expected_version: t.version + 1,
    note: "",
    submission: { url: "https://github.com/meera-dev/site/pull/4", note: "" },
  });

  // Approving from the queue opens the checklist; untick one.
  await admin.getByRole("link", { name: "Reviews" }).click();
  await admin.getByTestId(`review-${title}`).getByTestId("review-approve").click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog.getByTestId("rubric-review")).toContainText("2 of 2 met");
  await dialog.getByRole("checkbox", { name: "Remembers the choice after reload" }).click();
  await expect(dialog.getByTestId("rubric-review")).toContainText("1 of 2 met");
  await dialog.getByTestId("review-confirm").click();
  await expectToast(admin, `Approved “${title}”`);

  // The student sees which were met, and the chat says so.
  await student.reload();
  await board.getByTestId("board-done").locator("summary").click();
  await board.getByRole("button", { name: title }).click();
  await expect(student.getByTestId("rubric")).toContainText("Review: 1 of 2 met");
  await expect(student.getByTestId("rubric").getByLabel("Not yet")).toHaveCount(1);
});
