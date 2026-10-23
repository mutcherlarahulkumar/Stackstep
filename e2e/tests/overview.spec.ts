import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { expectToast, signIn } from "./helpers";

test("placement overview: cohort numbers, filters, CSV export and nudging inactive students (PO1–PO8)", async ({ page }) => {
  await signIn(page, "admin-demo");
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Placement overview" })).toBeVisible();
  const summary = page.getByTestId("overview-summary");
  await expect(summary).toContainText("Students");
  await expect(page.getByTestId("overview-row-kiran-dev")).toContainText("Paused");
  // Credits include the welcome grant even before a student opens their wallet.
  await expect(page.getByTestId("overview-row-kiran-dev").getByRole("cell").nth(5)).toHaveText("20");

  // Filters narrow the table; paused students are never "inactive".
  await page.getByTestId("filter-inactive").click();
  await expect(page.getByTestId("overview-row-kiran-dev")).toBeHidden();
  await page.getByTestId("filter-all").click();

  // Search narrows server side.
  await page.getByTestId("overview-search").fill("meera");
  await expect(page.getByTestId("overview-row-asha-dev")).toBeHidden();
  await expect(page.getByTestId("overview-row-meera-dev")).toBeVisible();

  // CSV export downloads the same rows, with a dated filename.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  expect(download.suggestedFilename()).toMatch(/^stackstep-cohort-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await download.path(), "utf8");
  const lines = csv.trim().split("\n");
  expect(lines[0]).toContain("name,github_login,email,program,status,day");
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain("meera-dev");

  // A row opens the full student detail without leaving the page.
  await page.getByTestId("overview-row-meera-dev").getByRole("button", { name: /Meera/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("certificate-panel")).toBeVisible();
  await page.keyboard.press("Escape");

  // Nudge: inactive students and a friendly draft are pre-filled; the admin can trim the list.
  await page.getByTestId("overview-search").fill("");
  await expect(page.getByTestId("overview-row-asha-dev")).toBeVisible();
  const nudge = page.getByTestId("open-nudge");
  // Seeded students are on day 3 with no activity, so they count as inactive.
  await expect(nudge).toBeEnabled();
  await nudge.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /^Nudge \d+ inactive/ })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Message" })).toHaveValue(/haven't seen you/);
  await dialog.getByRole("button", { name: "Clear" }).click();
  await dialog.getByRole("checkbox", { name: /Meera Iyer/ }).check();
  await dialog.getByRole("button", { name: /Send to 1 student/ }).click();
  await expectToast(page, "Sent to 1 student");
});

test("coming soon: payments, PR checks, AI review and certificate artwork are labelled, not faked", async ({ page }) => {
  await signIn(page, "admin-demo");
  await page.goto("/admin/overview");
  const soon = page.getByRole("region", { name: "Coming soon" });
  for (const name of ["Payments (Razorpay)", "GitHub PR checks", "AI review suggestions", "Certificate artwork (Orshot)"]) {
    await expect(soon.getByText(name)).toBeVisible();
  }
});
