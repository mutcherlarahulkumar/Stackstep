import { expect, test } from "@playwright/test";

import { api, apiToken, expectToast, signIn, unique } from "./helpers";

type Task = { id: string; version: number };

test.use({ viewport: { width: 1440, height: 900 } });

test("task notes: private by default, Markdown preview, shared notes show next to the hand-in (TN1–TN3)", async ({ page, request }) => {
  const title = unique("Debounce the search box");
  const admin = await apiToken(request, "admin-demo");
  const students = await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=meera");
  const enrollment = students.items[0]?.enrollment.id ?? "";
  const task = await api<Task>(request, admin, "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "feature",
    title,
    brief: "Wait 300 ms after typing.",
    due_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });

  await signIn(page, "meera-dev");
  const board = page.getByRole("region", { name: "Task board" });
  await board.getByRole("button", { name: title }).click();
  const notes = page.getByTestId("task-notes");
  await expect(notes).toContainText("Only you can see your notes");
  await expect(notes.getByTestId("note-save")).toBeDisabled();
  await notes.getByTestId("note-body").fill("## Plan\n\n- use `setTimeout`\n- cancel on each key");
  await expect(notes).toContainText("Unsaved changes");
  await notes.getByRole("radio", { name: "Preview" }).click();
  await expect(notes.getByTestId("note-preview").getByText("Plan", { exact: true })).toBeVisible();
  await expect(notes.getByTestId("note-preview").locator("code")).toHaveText("setTimeout");
  await notes.getByTestId("note-save").click();
  await expectToast(page, "Notes saved");

  // Private: the reviewer doesn't see it yet.
  const meera = await apiToken(request, "meera-dev");
  await api(request, meera, "POST", `/v1/tasks/${task.id}/transitions`, { to: "in_progress", expected_version: task.version, note: "" });
  await api(request, meera, "POST", `/v1/tasks/${task.id}/transitions`, {
    to: "in_review",
    expected_version: task.version + 1,
    note: "",
    submission: { url: "https://github.com/meera-dev/search/pull/3", note: "" },
  });
  const reviewer = await (await page.context().browser()?.newContext({ viewport: { width: 1440, height: 900 } }))?.newPage();
  if (!reviewer) throw new Error("no browser");
  await signIn(reviewer, "admin-demo");
  await reviewer.getByRole("link", { name: "Reviews" }).click();
  const card = reviewer.getByTestId(`review-${title}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId("shared-note")).toHaveCount(0);

  // Shared: it shows next to the hand-in, rendered as Markdown.
  await page.reload();
  await board.getByRole("radio", { name: /^In review/ }).click();
  await board.getByRole("button", { name: title }).click();
  await notes.getByTestId("note-share").click();
  await notes.getByTestId("note-save").click();
  await expectToast(page, "Notes saved and shared with your reviewer");
  await reviewer.reload();
  await card.getByTestId("shared-note").locator("summary").click();
  await expect(card.getByTestId("shared-note").getByText("Plan", { exact: true })).toBeVisible();
});
