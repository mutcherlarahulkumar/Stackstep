import { expect, test } from "@playwright/test";

import { api, apiToken, expectToast, signIn, unique } from "./helpers";

test("mail: announcements reach the right students, letters read as Markdown, reviews link to the task (MA1–MA9)", async ({ browser, request }) => {
  const subject = unique("Demo day");
  // An admin writes to everyone, previews the Markdown and sends it.
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByRole("link", { name: "Announcements" }).click();
  await expect(admin.getByRole("heading", { name: "Announcements" })).toBeVisible();
  await admin.getByTestId("announce-send").click();
  await expect(admin.getByText("Write a subject of at least 3 characters.")).toBeVisible();
  await admin.getByLabel("Subject").fill(subject);
  await admin.getByLabel("Message").fill("## Friday\n\nShow **one thing** you built.\n\n> [!TIP]\n> Keep it to five minutes.\n\n[Demo tips](https://developer.mozilla.org)");
  await admin.getByTestId("announce-preview").click();
  await expect(admin.getByRole("note", { name: "Tip" })).toContainText("Keep it to five minutes.");
  await admin.getByTestId("announce-send").click();
  await expectToast(admin, new RegExp(`Sent “${subject}” to \\d+ students`));
  await expect(admin.getByTestId(`announcement-${subject}`)).toContainText("Everyone");

  // A student sees the badge, opens Mail, reads it; links open in a new tab.
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "ravi-dev");
  await expect(student.getByTestId("open-mail")).toHaveAccessibleName(/unread/);
  await student.getByTestId("open-mail").click();
  await student.getByTestId(`mail-row-${subject}`).click();
  const letter = student.getByTestId("mail-letter");
  await expect(letter.getByRole("heading", { name: subject })).toBeVisible();
  await expect(letter.getByRole("note", { name: "Tip" })).toBeVisible();
  await expect(letter.getByRole("link", { name: /Demo tips/ })).toHaveAttribute("target", "_blank");
  await expect(student.getByTestId(`mail-row-${subject}`).getByLabel("Unread")).toHaveCount(0);

  // A review lands as mail and opens the task on the board.
  const token = await apiToken(request, "admin-demo");
  const ravi = (await api<{ items: { enrollment: { id: string } }[] }>(request, token, "GET", "/v1/admin/students?q=ravi")).items[0]?.enrollment.id;
  const title = unique("Mail review");
  const t = await api<{ id: string; version: number }>(request, token, "POST", `/v1/admin/enrollments/${ravi}/tasks`, {
    type: "feature",
    title,
    brief: "Ship it.",
    due_at: new Date(Date.now() + 3 * 3600e3).toISOString(),
  });
  const raviToken = await apiToken(request, "ravi-dev");
  await api(request, raviToken, "POST", `/v1/tasks/${t.id}/transitions`, { to: "in_progress", expected_version: t.version, note: "" });
  await api(request, raviToken, "POST", `/v1/tasks/${t.id}/transitions`, {
    to: "in_review",
    expected_version: t.version + 1,
    note: "",
    submission: { url: "https://github.com/ravi/demo/pull/1", note: "" },
  });
  await api(request, token, "POST", `/v1/tasks/${t.id}/transitions`, { to: "done", expected_version: t.version + 2, note: "Clean work." });
  await student.reload();
  await student.getByTestId(`mail-row-“${title}” is approved`).click();
  await expect(student.getByTestId("mail-letter")).toContainText("Clean work.");
  await student.getByTestId("mail-open-task").click();
  await expect(student.getByRole("dialog", { name: title })).toBeVisible();
});
