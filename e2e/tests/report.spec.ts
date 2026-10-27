import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { api, apiToken, signIn, unique } from "./helpers";

type Task = { id: string; version: number };

test.use({ viewport: { width: 1440, height: 900 } });

test("weekly report: totals, cohorts, standouts, week navigation and CSV (WR1, WR2, WR6)", async ({ page, request }) => {
  // Ravi finishes a self-check task this week.
  const admin = await apiToken(request, "admin-demo");
  const students = await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=ravi");
  const t = await api<Task>(request, admin, "POST", `/v1/admin/enrollments/${students.items[0]?.enrollment.id ?? ""}/tasks`, {
    type: "standup",
    title: unique("Standup"),
    brief: "",
    review_mode: "self",
    due_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  const ravi = await apiToken(request, "ravi-dev");
  await api(request, ravi, "POST", `/v1/tasks/${t.id}/transitions`, { to: "in_progress", expected_version: t.version, note: "" });
  await api(request, ravi, "POST", `/v1/tasks/${t.id}/transitions`, { to: "done", expected_version: t.version + 1, note: "" });

  await signIn(page, "admin-demo");
  await page.getByRole("link", { name: "Insights" }).click();
  await page.getByRole("link", { name: "Weekly report" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Weekly report" })).toBeVisible();
  await expect(page.getByTestId("report-cohorts")).toContainText("ANITS Batch 1");
  await expect(page.getByTestId("report-cohorts")).toContainText("Independent students");
  await expect(page.getByTestId("report-top")).toContainText("Ravi Teja");
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();

  const download = page.waitForEvent("download");
  await page.getByTestId("report-csv").click();
  const csv = await readFile(await (await download).path(), "utf8");
  expect(csv.split("\r\n")[0]).toContain("cohort,college,students");

  const thisWeek = await page.getByTestId("report-week").innerText();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByTestId("report-week")).not.toHaveText(thisWeek);
  await expect(page.getByTestId("report-top")).toContainText("Nobody finished a task this week yet.");
  await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
});

test("the student's progress shows this week's recap (WR5)", async ({ page }) => {
  await signIn(page, "ravi-dev");
  await page.getByTestId("open-progress").click();
  await expect(page.getByTestId("this-week")).toContainText(/finished|Nothing finished yet/);
});
