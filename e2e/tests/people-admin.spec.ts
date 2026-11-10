import { expect, test } from "@playwright/test";

import { expectToast, signIn } from "./helpers";

test("a student's attendance grows a forest (AT3, AT6)", async ({ page }) => {
  await signIn(page, "asha-dev");
  await page.getByTestId("open-progress").click();
  await page.getByTestId("open-attendance").click();
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(page.getByTestId("attendance-forest")).toBeVisible();
  // Opening the workspace marked today present, with a seat number.
  const today = page.getByTestId("attendance-seats").locator('[data-status="present"]').last();
  await expect(today).toHaveAccessibleName(/Present, seat \d+/);
  await expect(page.getByTestId("attendance-stats")).toContainText("Streak");
});

test("admins open a full profile, keep notes and sign people out (PA1 to PA3, SO2)", async ({ page, browser }) => {
  // Ravi opens the app, so he has a session to end.
  const ravi = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(ravi, "ravi-dev");

  await signIn(page, "admin-demo");
  await page.goto("/admin/people");
  const dir = page.getByTestId("directory");
  await dir.getByTestId("directory-kind-interns").click();
  await dir.getByTestId("directory-search").fill("ravi");
  await dir.getByTestId("person-ravi-dev").click();

  const profile = page.getByTestId("profile");
  await expect(profile.getByRole("heading", { name: "Ravi Teja" })).toBeVisible();
  await expect(profile.getByTestId("profile-github")).toHaveAttribute("href", "https://github.com/ravi-dev");
  await expect(profile.getByTestId("profile-attendance-note")).toContainText("Present");

  // Notes are a to-do list.
  const note = `Check in about week 1 ${Date.now().toString(36)}`;
  await profile.getByTestId("note-input").fill(note);
  await profile.getByTestId("note-add").click();
  const item = profile.getByTestId("note").filter({ hasText: note });
  await expect(item).toBeVisible();
  await item.getByRole("checkbox").click();
  await expect(item.getByRole("checkbox")).toBeChecked();

  // The forest opens from the profile.
  await profile.getByTestId("profile-forest").click();
  const forest = page.getByRole("dialog", { name: /forest/ });
  await expect(forest.getByTestId("attendance-forest")).toBeVisible();
  await forest.getByRole("button", { name: "Close" }).click();
  await expect(forest).toBeHidden();

  // Chats opens Ravi's own chats in the inbox, then back to his profile.
  await profile.getByTestId("profile-chats").click();
  await expect(page).toHaveURL(/\/admin\/inbox\?student=ravi-dev/);
  await expect(page.getByRole("heading", { name: "Ravi Teja" })).toBeVisible();
  await expect(page.getByTestId("student-personas")).toBeVisible();
  // Back returns to the profile, still open where it was.
  await page.goBack();
  await expect(profile.getByRole("heading", { name: "Ravi Teja" })).toBeVisible();

  // Signing out everywhere sends Ravi back to GitHub sign in.
  await profile.getByTestId("profile-sign-out").click();
  await page.getByTestId("profile-sign-out-confirm").click();
  await expectToast(page, "Ravi Teja is signed out everywhere");
  await ravi.reload();
  await expect(ravi).toHaveURL(/\/login/, { timeout: 20_000 });
});
