import { expect, test } from "@playwright/test";

import { expectToast, signIn } from "./helpers";

test("AI helper: explain it in one go, get hints in Markdown, wait before following up; admins see it read only (A1–A4)", async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "ravi-dev");
  const chips = student.getByTestId("wallet-chips");
  await expect(chips.getByLabel("20 credits")).toBeVisible();

  await student.getByRole("navigation", { name: "Chats" }).getByTestId("thread-ai").click();
  const helper = student.getByTestId("ai-helper");
  await expect(helper.getByText("Learn to write good prompts")).toBeVisible();
  await helper.getByTestId("ai-new").click();

  // One-liners are refused before anything is spent.
  await helper.getByLabel("What are you trying to do?").fill("fix it");
  await helper.getByTestId("ai-ask").click();
  await expect(helper.getByText("What you're trying to do needs at least 20 characters.")).toBeVisible();
  await expect(helper.getByText("What you've tried needs at least 30 characters.")).toBeVisible();

  await helper.getByLabel("What are you trying to do?").fill("Filter the task list by status without reloading the page.");
  await helper.getByLabel("What have you tried so far?").fill("I used Array.filter on the tasks array, but the list doesn't change when I pick a status.");
  await helper.getByLabel("What happens instead? (optional)").fill("No error. The list stays the same.");
  await helper.getByLabel("Relevant code (optional)").fill("const shown = tasks.filter(t => t.status === status)");
  await helper.getByTestId("ai-ask").click();

  const answer = helper.getByTestId("ai-answer").first();
  await expect(answer.getByText("What's going on", { exact: true })).toBeVisible();
  await expect(answer.locator("strong", { hasText: "Asking tip" })).toBeVisible();
  await expect(answer.locator("code", { hasText: "shown" })).toBeVisible();
  await expect(chips.getByLabel("19 credits")).toBeVisible();
  // Follow-ups wait until the student has tried the hint.
  await expect(helper.getByTestId("ai-cooldown")).toContainText("Try the hint yourself first.");

  // A new question right away is held back with a countdown.
  await helper.getByRole("button", { name: "All AI questions" }).click();
  await helper.getByTestId("ai-new").click();
  await expect(helper.getByTestId("ai-ask")).toContainText("Next question in");
  await expect(helper.getByTestId("ai-ask")).toBeDisabled();

  // The admin reads it (read only) and adds credits with a reason.
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByLabel("Search students").fill("ravi");
  await admin.getByTestId("student-ravi-dev").click();
  const panel = admin.getByTestId("wallet-panel");
  await expect(panel).toContainText("19 credits");
  await panel.getByRole("button", { name: /AI today/ }).click();
  await admin.getByRole("button", { name: /Filter the task list by status/ }).click();
  await expect(admin.getByTestId("ai-answer").first()).toContainText("Try this next");
  await admin.keyboard.press("Escape");

  await panel.getByTestId("open-credits").click();
  await admin.getByTestId("credits-save").click();
  await expect(admin.getByText("Say why, so the student understands the change.")).toBeVisible();
  await admin.getByLabel("Reason").fill("Helped a teammate debug");
  await admin.getByTestId("credits-save").click();
  await expectToast(admin, "Ravi now has 24 credits");
});
