import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("privacy and terms are public and linked from sign-in (AC5)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "privacy notice" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who can see it" })).toBeVisible();
  await page.getByRole("link", { name: "terms of use" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
});
