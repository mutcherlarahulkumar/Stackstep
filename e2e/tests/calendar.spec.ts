import { expect, test } from "@playwright/test";

import { api, apiToken, signIn, unique } from "./helpers";

/** YYYY-MM-DD in India, the seeded students' zone. */
const istDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

test("calendar: tasks out now open on the board, tasks ahead are locked (CA4, CA6)", async ({ page, request }) => {
  const admin = await apiToken(request, "admin-demo");
  const ravi = (await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=ravi")).items[0]?.enrollment.id;
  expect(ravi).toBeTruthy();
  const now = unique("Calendar now");
  const later = unique("Calendar later");
  const soon = new Date(Date.now() + 3 * 3600e3);
  const ahead = new Date(Date.now() + 2 * 86_400_000);
  await api(request, admin, "POST", `/v1/admin/enrollments/${ravi}/tasks`, { type: "feature", title: now, brief: "Out now.", due_at: soon.toISOString() });
  await api(request, admin, "POST", `/v1/admin/enrollments/${ravi}/tasks`, {
    type: "feature",
    title: later,
    brief: "Not yet.",
    scheduled_for: ahead.toISOString(),
    due_at: new Date(ahead.getTime() + 3 * 3600e3).toISOString(),
  });

  await signIn(page, "ravi-dev");
  await page.getByTestId("open-calendar").click();
  const dialog = page.getByRole("dialog", { name: "Your calendar" });
  await expect(dialog).toBeVisible();
  // The grid opens on today; a day further out shows its task with the time but locked.
  await dialog.getByTestId(`calendar-cell-${istDay(ahead)}`).click();
  const lockedRow = dialog.getByTestId(`calendar-entry-${later}`);
  await expect(lockedRow).toContainText("Arrives at");
  await expect(lockedRow.getByRole("img", { name: "Opens when it arrives" })).toBeVisible();
  // Today's task opens straight on the board.
  await dialog.getByTestId(`calendar-cell-${istDay(new Date())}`).click();
  await dialog.getByTestId(`calendar-entry-${now}`).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("dialog", { name: now })).toBeVisible();
});

test("calendar on a phone is a day-by-day agenda @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "meera-dev");
  await page.getByTestId("open-calendar").click();
  const dialog = page.getByRole("dialog", { name: "Your calendar" });
  await expect(dialog.getByRole("region", { name: "Today" }).or(dialog.getByRole("region", { name: "Tomorrow" })).first()).toBeVisible();
  await expect(dialog.getByRole("grid")).toHaveCount(0);
});
