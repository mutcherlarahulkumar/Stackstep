import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { api, apiToken, expectToast, signIn } from "./helpers";

test("placement overview: cohort numbers, filters, CSV export and nudging inactive students (PO1–PO8)", async ({ page, request }) => {
  // A student who started three days ago and never showed up: inactive regardless of test order.
  const quiet = `quiet-${Date.now().toString(36)}`;
  const start = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  await api(request, await apiToken(request, "admin-demo"), "POST", "/v1/admin/enrollments", {
    github_login: quiet,
    name: "Quiet Student",
    program_slug: "frontend-30",
    start_date: start,
    timezone: "UTC",
  });
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
  await expect(page.getByTestId(`overview-row-${quiet}`).getByTestId("inactive-badge")).toBeVisible();
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

test("coming soon: payments, PR checks, phone push and certificate artwork are labelled, not faked", async ({ page }) => {
  await signIn(page, "admin-demo");
  await page.goto("/admin/overview");
  const soon = page.getByRole("region", { name: "Coming soon" });
  for (const name of ["Payments (Razorpay)", "GitHub PR checks", "Push notifications on phones", "Certificate artwork (Orshot)"]) {
    await expect(soon.getByText(name)).toBeVisible();
  }
  // AI review drafts shipped (feature 14): no longer listed as coming soon.
  await expect(soon.getByText("AI review suggestions")).toHaveCount(0);
});
