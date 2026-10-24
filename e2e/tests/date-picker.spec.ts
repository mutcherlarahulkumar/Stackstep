import { expect, test } from "@playwright/test";

import { expectToast, signIn, unique } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test("assign with a picked due date: calendar, time, and past days disabled (U6)", async ({ page }) => {
  const title = unique("Write the README");
  await signIn(page, "admin-demo");
  await page.getByTestId("student-ravi-dev").click();
  await page.getByTestId("open-assign").click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("radio", { name: "Pick…" }).click();

  // The time waits for a day; yesterday can't be picked.
  await expect(page.getByLabel("Due, time")).toBeDisabled();
  await page.getByRole("button", { name: /^Due: not set/ }).click();
  const calendar = page.getByRole("grid");
  const yesterday = new Date(Date.now() - 86_400_000);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
  if (yesterday.getMonth() === new Date().getMonth()) {
    await expect(calendar.getByRole("button", { name: new RegExp(`${month(yesterday)} ${yesterday.getDate()}(st|nd|rd|th)`) })).toBeDisabled();
  }
  if (tomorrow.getMonth() !== new Date().getMonth()) await page.getByRole("button", { name: /next month/i }).click();
  await calendar.getByRole("button", { name: new RegExp(`${month(tomorrow)} ${tomorrow.getDate()}(st|nd|rd|th)`) }).click();
  await page.getByLabel("Due, time").fill("17:30");
  await expect(page.getByRole("button", { name: /^Due: / })).not.toContainText("not set");

  await page.getByTestId("assign-submit").click();
  await expectToast(page, `Assigned “${title}”`);
  await expect(page.getByTestId(`task-row-${title}`)).toContainText("5:30 PM");
});
