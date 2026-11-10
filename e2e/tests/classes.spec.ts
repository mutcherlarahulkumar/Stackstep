import { expect, test } from "@playwright/test";

import { expectToast, signIn, unique } from "./helpers";

test("live class: schedule and invite, present a screen, chat, questions to mail, hands and mics, end (LC1–LC18)", async ({ browser }) => {
  test.setTimeout(90_000);
  const title = unique("Git live");
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByRole("link", { name: "Classes" }).click();
  await expect(admin.getByRole("heading", { name: "Live classes" })).toBeVisible();
  await admin.getByTestId("class-schedule").click();
  await expect(admin.getByText("Pick the day and time.")).toBeVisible();
  await admin.getByLabel("Title").fill(title);
  await admin.getByLabel("Day").click();
  await admin.locator("[data-today=true] button").first().click();
  await admin.getByLabel("Time").fill("23:59");
  await admin.getByTestId("class-schedule").click();
  await expectToast(admin, `Scheduled ${title}`);
  const card = admin.getByTestId(`class-${title}`);
  await expect(card).toContainText("Scheduled");

  // The student is invited by mail; the letter opens the lobby.
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] })).newPage();
  await signIn(student, "asha-dev");
  await student.goto("/mail");
  await student.getByTestId(`mail-row-Live class ${title}`).click();
  await student.getByTestId("mail-join-class").click();
  await expect(student.getByTestId("class-lobby")).toContainText(title);

  // The host opens the room (the class goes live) and presents.
  await card.getByTestId("class-open-room").click();
  await admin.getByTestId("class-join").click();
  await expect(admin.getByTestId("class-room")).toBeVisible();
  await student.getByTestId("class-join").click();
  await expect(student.getByTestId("class-room")).toBeVisible();
  await admin.getByTestId("class-present").click();
  await expect(student.getByText("Platform Admin is presenting")).toBeVisible();
  await admin.getByTestId("class-share").click();
  await expect
    .poll(() => student.locator("[data-testid=class-stage] video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);

  // Chat both ways; a question goes up, gets an upvote and is promoted to mail.
  await student.getByTestId("class-chat-input").fill("Hello from Asha");
  await student.keyboard.press("Enter");
  await expect(admin.getByTestId("class-chat")).toContainText("Hello from Asha");
  await student.getByTestId("tab-qa").click();
  await student.getByTestId("class-ask-input").fill("When do I rebase instead of merge?");
  await student.keyboard.press("Enter");
  await admin.getByTestId("tab-qa").click();
  const question = admin.getByTestId("class-questions").getByText("When do I rebase instead of merge?");
  await expect(question).toBeVisible();
  await admin.getByTestId("class-questions").getByRole("button", { name: "Send as an announcement" }).first().click();
  await expectToast(admin, "Sent to every invitee's mail");

  // Hands and mics: the student can't speak until a host lets them.
  await expect(student.getByTestId("class-mic")).toBeDisabled();
  await student.getByTestId("class-hand").click();
  await admin.getByTestId("tab-people").click();
  await expect(admin.getByTestId("class-people").getByLabel("Hand raised")).toBeVisible();
  await admin.getByTestId("allow-mic-asha-dev").click();
  await expect(student.getByTestId("class-mic")).toBeEnabled();

  // Drawing tools appear while sharing; then the host ends the class for everyone.
  await admin.getByTestId("class-draw").click();
  await expect(admin.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
  await admin.getByTestId("class-end").click();
  await admin.getByTestId("class-end-confirm").click();
  await expect(student.getByText("The class has ended")).toBeVisible();

  const mail = await (await browser.newContext()).newPage();
  await signIn(mail, "asha-dev");
  await mail.goto("/mail");
  await expect(mail.getByTestId(`mail-row-From the class ${title}`)).toBeVisible();
});
