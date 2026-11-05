import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";


test("home: signed out sees Sign in; Verify works without an account (HM1, HM2)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Build it step by step");
  await expect(page.getByTestId("nav-sign-in")).toBeVisible();
  await expect(page.getByTestId("hero-start").first()).toBeVisible();
  await page.getByTestId("nav-verify").click();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByRole("heading", { name: "Check a certificate" })).toBeVisible();

  // The home page's own code box checks the format before leaving.
  await page.goto("/");
  await page.getByTestId("home-verify-input").fill("nope");
  await page.getByTestId("home-verify-submit").click();
  await expect(page.getByText("Codes are 12 letters and digits")).toBeVisible();
  await page.getByTestId("home-verify-input").fill("abcd-efgh-jk23");
  await page.getByTestId("home-verify-submit").click();
  await expect(page).toHaveURL(/\/verify\/ABCDEFGHJK23$/);
});

test("home: signed in never says Sign in and links back to the right place (HM3)", async ({ page }) => {
  await signIn(page, "asha-dev");
  await page.goto("/");
  await expect(page.getByTestId("nav-open-app")).toHaveText(/Open workspace/);
  await expect(page.getByTestId("nav-sign-in")).toHaveCount(0);
  await expect(page.getByTestId("hero-open-app").first()).toBeVisible();
  await page.getByTestId("nav-open-app").click();
  await expect(page).toHaveURL(/\/workspace$/);
});

test("home: admins go to the console; students without an internship continue their application (HM3)", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "admin-demo");
  await admin.goto("/");
  await expect(admin.getByTestId("nav-open-app")).toHaveText(/Open admin console/);
  const nora = await (await browser.newContext()).newPage();
  await signIn(nora, "nora-dev");
  await nora.goto("/");
  await expect(nora.getByTestId("nav-open-app")).toHaveText(/Continue application/);
});

test.describe("home on a phone @mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Verify stays in the bar (HM2)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-verify-phone")).toBeVisible();
    await page.getByTestId("nav-verify-phone").click();
    await expect(page).toHaveURL(/\/verify$/);
  });
});
