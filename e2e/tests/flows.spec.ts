import { expect, test, type Page } from "@playwright/test";

import { expectToast, signIn, unique } from "./helpers";

async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

test("flows: duplicate, add a task, publish and assign; the student gets it from the right persona (F5, F6, G2)", async ({ browser }) => {
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const name = unique("Angular Frontend · 30 days");
  const task = unique("Angular signals store");

  await signIn(admin, "admin-demo");
  await admin.getByRole("link", { name: "Flows" }).click();
  await expect(admin.getByTestId("flow-row-React Frontend · 30 days")).toContainText("Published v1");

  // Duplicate the React flow into an Angular one; the copy opens as a draft with every task.
  await admin.getByTestId("duplicate-React Frontend · 30 days").click();
  await admin.getByLabel("New name").fill(name);
  await admin.getByLabel("Stream").fill("Angular");
  await admin.getByTestId("dup-save").click();
  await expect(admin.getByRole("heading", { name })).toBeVisible();
  await expect(admin.getByText(/· 10 tasks/)).toBeVisible();

  // Today is day 3 for the seeded students; a 00:00 item releases right away.
  await admin.getByTestId("day-3").click();
  await expect(admin.getByTestId("item-Valid Anagram")).toBeVisible();
  await admin.getByTestId("add-new-task").click();
  await admin.getByTestId("item-save").click();
  await expect(admin.getByText("Title is required.")).toBeVisible();
  await admin.getByLabel("Title").fill(task);
  await pick(admin, "Posted by", "Priya Sharma");
  await admin.getByLabel("Shows up at").fill("00:00");
  await admin.getByTestId("item-save").click();
  await expect(admin.getByTestId(`item-${task}`)).toBeVisible();
  await expect(admin.getByText("Unsaved changes")).toBeVisible();

  await admin.getByTestId("save-draft").click();
  await expectToast(admin, "Draft saved");
  await admin.getByTestId("publish-flow").click();
  await admin.getByTestId("publish-confirm").click();
  await expectToast(admin, "Published v1");

  // The React flow is unchanged by the copy.
  await admin.getByRole("link", { name: "All flows" }).click();
  await expect(admin.getByTestId("flow-row-React Frontend · 30 days")).toContainText("10");

  await admin.getByRole("link", { name }).click();
  await admin.getByTestId("open-assign-flow").click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Search students").fill("ravi");
  await dialog.getByLabel(/Ravi/).check();
  await admin.getByTestId("assign-flow-submit").click();
  await expect(admin.getByText(/scheduled/)).toBeVisible();
  await admin.getByRole("button", { name: "Done" }).click();

  // Ravi now has a chat with Priya announcing the new task, and the card on the board.
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "ravi-dev");
  const chats = student.getByRole("navigation", { name: "Chats" });
  await chats.getByTestId("thread-Priya Sharma").click();
  await expect(student.getByTestId("chat-log")).toContainText(task, { timeout: 10_000 });
  const board = student.getByRole("region", { name: "Task board" });
  await expect(board.getByText(task)).toBeVisible();
  await expect(board.getByText(task).locator("xpath=ancestor::*[@data-slot='card'][1]")).toContainText("Priya Sharma");
});

test("inbox: admin answers as the persona and the student sees it live; broadcast opens a new chat (C5)", async ({ browser }) => {
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const question = unique("Can I use a heap here");
  const answer = unique("Yes, a min-heap works");
  const notice = unique("Demo day moved to Friday");

  await signIn(student, "asha-dev");
  await student.getByRole("navigation", { name: "Chats" }).getByTestId("thread-Sam Rivera").click();
  await student.getByLabel("Message Sam Rivera").fill(question);
  await student.keyboard.press("Enter");
  await expect(student.getByTestId("chat-log")).toContainText(question);

  await signIn(admin, "admin-demo");
  await admin.goto("/admin/inbox");
  const thread = admin.getByTestId("staff-thread-asha-dev-Sam Rivera");
  await thread.click();
  await expect(admin.getByTestId("chat-log")).toContainText(question);
  await admin.getByLabel("Message Asha Rao").fill(answer);
  await admin.keyboard.press("Enter");
  await expect(admin.getByTestId("chat-log")).toContainText(answer);
  await expect(student.getByTestId("chat-log")).toContainText(answer, { timeout: 10_000 });

  // Broadcast: nothing picked is explained, then one student gets it in Neha's chat.
  await admin.getByTestId("open-broadcast").click();
  await admin.getByTestId("broadcast-send").click();
  await expect(admin.getByText("Pick at least one student.")).toBeVisible();
  await expect(admin.getByText("Write a message first.")).toBeVisible();
  await pick(admin, "From", "Neha Kapoor");
  await admin.getByLabel("Message", { exact: true }).fill(notice);
  await admin.getByRole("dialog").getByLabel("Search students").fill("asha");
  await admin.getByRole("dialog").getByLabel(/Asha Rao/).check();
  await admin.getByTestId("broadcast-send").click();
  await expectToast(admin, "Sent to 1 student");

  const neha = student.getByRole("navigation", { name: "Chats" }).getByTestId("thread-Neha Kapoor");
  await expect(neha).toContainText(notice, { timeout: 10_000 });
  await expect(neha).toHaveAttribute("aria-label", /1 unread/);
});

test("personas and library validate before saving (P1, L1)", async ({ page }) => {
  await signIn(page, "admin-demo");
  await page.goto("/admin/personas");
  await expect(page.getByTestId("persona-row-Priya Sharma")).toBeVisible();
  await page.getByTestId("new-persona").click();
  await page.getByLabel("Name").fill("A");
  await page.getByLabel("Title", { exact: true }).fill("QA Lead");
  await page.getByTestId("persona-save").click();
  await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
  const name = unique("Dev Rao");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("radio", { name: "amber" }).click();
  await page.getByTestId("persona-save").click();
  await expectToast(page, `Added ${name}`);
  await expect(page.getByTestId(`persona-row-${name}`)).toBeVisible();

  await page.getByRole("link", { name: "Task library" }).click();
  await expect(page.getByTestId("template-row-Two Sum")).toBeVisible();
  await page.getByTestId("new-template").click();
  await page.getByTestId("template-save").click();
  await expect(page.getByText("Title is required.")).toBeVisible();
  const title = unique("Merge sort");
  await page.getByLabel("Title").fill(title);
  await pick(page, "Type", "DSA");
  await page.getByTestId("template-save").click();
  await expectToast(page, `Added “${title}” to the library`);
  await expect(page.getByTestId(`template-row-${title}`)).toBeVisible();
});
