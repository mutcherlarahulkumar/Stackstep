import { expect, test } from "@playwright/test";

import { openChat, signIn } from "./helpers";

test("chat: reactions show on both sides live; the inbox lists students by flow and starts new chats (CH1–CH8)", async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "asha-dev");
  await openChat(student, "Sam Rivera");
  const bubble = student.getByTestId("chat-bubble").first();
  await bubble.hover();
  await student.getByTestId("react-open").first().click();
  await student.getByTestId("reaction-bar").getByTestId("react-party").click();
  const chip = student.getByTestId("chip-party").first();
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  // The admin sees it, adds the persona's heart, and the student sees that live.
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.goto("/admin/inbox");
  await admin.getByTestId("inbox-student-asha-dev").click();
  await admin.getByTestId("student-persona-Sam Rivera").click();
  await expect(admin.getByTestId("chip-party").first()).toHaveAttribute("aria-pressed", "false");
  await admin.getByTestId("chat-bubble").first().hover();
  await admin.getByTestId("react-open").first().click();
  await admin.getByTestId("reaction-bar").getByTestId("react-heart").click();
  await expect(student.getByTestId("chip-heart").first()).toBeVisible({ timeout: 10_000 });
  // Undo from the chip.
  await chip.click();
  await expect(student.getByTestId("chip-party")).toHaveCount(0);

  // Filter by flow: only Meera is on the React flow. Start a chat as a persona she hasn't met.
  await admin.getByTestId("inbox-flow").click();
  await admin.getByRole("option", { name: /React Frontend/ }).click();
  const students = admin.getByTestId("inbox-students");
  await expect(students.getByTestId("inbox-student-meera-dev")).toBeVisible();
  await expect(students.getByTestId("inbox-student-asha-dev")).toHaveCount(0);
  await admin.getByTestId("inbox-student-meera-dev").click();
  await admin.getByTestId("start-as-Sam Rivera").or(admin.getByTestId("student-persona-Sam Rivera")).first().click();
  await expect(admin.getByLabel("Message Meera Iyer")).toBeVisible();
});
