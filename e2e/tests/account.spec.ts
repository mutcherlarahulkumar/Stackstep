import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test("privacy and terms are public and linked from sign-in (AC5)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "privacy notice" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who can see it" })).toBeVisible();
  await page.getByRole("link", { name: "terms of use" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
});

test("download my data from the account menu (AX1)", async ({ page }) => {
  await signIn(page, "asha-dev");
  await page.getByRole("button", { name: "Account menu" }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-my-data").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^stackstep-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  const data = JSON.parse(await readFile(path, "utf8")) as {
    profile: { github_login: string };
    internships: unknown[];
  };
  expect(data.profile.github_login).toBe("asha-dev");
  expect(data.internships.length).toBe(1);
});
