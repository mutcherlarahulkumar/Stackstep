import { expect, test } from "@playwright/test";

import { expectToast, openChat, signIn, unique } from "./helpers";

test.describe("student workspace", () => {
  test("chat: send a message and get the lead's delayed reply live", async ({ page }) => {
    await signIn(page, "asha-dev");
    await expect(page).toHaveURL(/\/workspace$/);
    await openChat(page, "Sam Rivera");
    const log = page.getByTestId("chat-log").first();
    await expect(log).toContainText("Welcome to Stackstep, Asha");

    const text = unique("PR ready for review");
    await page.getByLabel("Message Sam Rivera").first().fill(text);
    await page.keyboard.press("Enter");
    await expect(log).toContainText(text);
    // The AI team lead's reply arrives over the WebSocket after LEAD_REPLY_DELAY, labelled (AL1).
    await expect(log).toContainText("A mentor will review it soon", { timeout: 15_000 });
    await expect(log.getByTestId("automated-label").last()).toContainText("Automatic reply");
  });

  test("composer blocks blank and over-long messages", async ({ page }) => {
    await signIn(page, "asha-dev");
    await openChat(page, "Sam Rivera");
    const input = page.getByLabel("Message Sam Rivera").first();
    const send = page.getByRole("button", { name: "Send message" }).first();
    await input.fill("   ");
    await expect(send).toBeDisabled();
    await input.fill("x".repeat(4001));
    await expect(send).toBeDisabled();
    await expect(page.getByText("4001 / 4000").first()).toBeVisible();
  });

  test("a student can't open the admin console", async ({ page }) => {
    await signIn(page, "asha-dev");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/workspace$/);
  });

  test("a student without an internship gets the application, not old chats (AP1)", async ({ page }) => {
    await signIn(page, "nora-dev");
    await expect(page.getByRole("heading", { name: "Join an internship cohort" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chats" })).toHaveCount(0);
  });
});

test("full loop: admin assigns → student works → admin reviews", async ({ browser }) => {
  const title = unique("Add filtering");
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  await signIn(student, "asha-dev");
  await openChat(student, "Sam Rivera");
  await signIn(admin, "admin-demo");
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.getByTestId("student-asha-dev").click();
  await admin.getByTestId("open-assign").click();

  // Client-side validation first.
  await admin.getByTestId("assign-submit").click();
  await expect(admin.getByText("Title is required.")).toBeVisible();

  await admin.getByLabel("Title").fill(title);
  await admin.getByLabel("Brief").fill("Filter by status. Branch: feat/filters.");
  await admin.getByRole("radio", { name: "In 2 hours" }).click();
  await admin.getByTestId("assign-submit").click();
  await expectToast(admin, `Assigned “${title}”`);
  await expect(admin.getByTestId(`task-row-${title}`)).toBeVisible();

  // The student sees the announcement and the card live, without reloading.
  const board = student.getByRole("region", { name: "Task board" });
  await expect(student.getByTestId("chat-log").first()).toContainText(`“${title}”`, { timeout: 10_000 });
  await expect(board.getByText(title)).toBeVisible();
  await board.getByRole("button", { name: title }).click();
  await student.getByTestId("move-in_progress").click();
  await expectToast(student, "Moved to In progress");
  await student.getByTestId("move-in_review").click();
  // A feature needs a link to the PR (S1).
  await student.getByTestId("hand-in-submit").click();
  await expect(student.getByText("Add the link to your work (PR, post or repo).")).toBeVisible();
  await student.getByLabel("Link", { exact: true }).fill("https://github.com/asha-dev/portfolio/pull/7");
  await student.getByLabel("Note (optional)").fill("Filters live in the URL.");
  await student.getByTestId("hand-in-submit").click();
  await expectToast(student, "Sent for review");
  await student.keyboard.press("Escape");

  // Admin requests changes: a note is required.
  await admin.reload();
  await admin.getByTestId("student-asha-dev").click();
  const row = admin.getByTestId(`task-row-${title}`);
  await expect(row).toContainText("In review");
  await expect(row.getByTestId("hand-in")).toContainText("github.com/asha-dev/portfolio/pull/7");
  await row.getByRole("button", { name: "Request changes" }).click();
  await admin.getByRole("button", { name: "Send to student" }).click();
  await expect(admin.getByText("Tell the student what to change.")).toBeVisible();
  await admin.getByLabel("What needs to change").fill("Keep the filter in the URL.");
  await admin.getByRole("button", { name: "Send to student" }).click();
  await expectToast(admin, "Changes requested");

  await expect(student.getByTestId("chat-log").first()).toContainText("Keep the filter in the URL.", { timeout: 10_000 });
  await board.getByRole("button", { name: title }).click();
  await student.getByTestId("move-in_review").click();
  // The last link is kept; the note says what changed this time.
  await expect(student.getByLabel("Link", { exact: true })).toHaveValue("https://github.com/asha-dev/portfolio/pull/7");
  await student.getByLabel("Note (optional)").fill("Kept the filter in the URL.");
  await student.getByTestId("hand-in-submit").click();
  await expectToast(student, "Sent for review");

  await admin.reload();
  await admin.getByTestId("student-asha-dev").click();
  await admin.getByTestId(`task-row-${title}`).getByRole("button", { name: "Approve" }).click();
  await expectToast(admin, "Approved");
  await expect(student.getByTestId("chat-log").first()).toContainText(`Approved: “${title}”`, { timeout: 10_000 });
});
