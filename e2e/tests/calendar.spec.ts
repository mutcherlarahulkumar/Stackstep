import { expect, test } from "@playwright/test";

import { api, apiToken, signIn, unique } from "./helpers";

/** YYYY-MM-DD in India, the seeded students' zone. */
const istDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

test("calendar: tasks out now open on the board, tasks ahead are locked (CA4, CA6)", async ({
  page,
  request,
}) => {
  const admin = await apiToken(request, "admin-demo");
  const ravi = (
    await api<{ items: { enrollment: { id: string } }[] }>(
      request,
      admin,
      "GET",
      "/v1/admin/students?q=ravi",
    )
  ).items[0]?.enrollment.id;
  expect(ravi).toBeTruthy();
  const now = unique("Calendar now");
  const later = unique("Calendar later");
  const soon = new Date(Date.now() + 3 * 3600e3);
  const ahead = new Date(Date.now() + 2 * 86_400_000);
  await api(request, admin, "POST", `/v1/admin/enrollments/${ravi}/tasks`, {
    type: "feature",
    title: now,
    brief: "Out now.",
    due_at: soon.toISOString(),
  });
  await api(request, admin, "POST", `/v1/admin/enrollments/${ravi}/tasks`, {
    type: "feature",
    title: later,
    brief: "Not yet.",
    scheduled_for: ahead.toISOString(),
    due_at: new Date(ahead.getTime() + 3 * 3600e3).toISOString(),
  });

  await signIn(page, "ravi-dev");
  await page.getByTestId("open-calendar").click();
  await expect(page).toHaveURL(/\/calendar$/);
  // The week timeline opens on this week, with a red line at the current time.
  await expect(page.getByTestId("calendar-timeline")).toBeVisible();
  await expect(page.getByTestId("calendar-now")).toBeVisible();
  // Month view: a day further out shows its task, which stays locked until it arrives.
  await page.getByTestId("calendar-view-month").click();
  if ((await page.getByTestId(`calendar-cell-${istDay(ahead)}`).count()) === 0)
    await page.getByRole("button", { name: "Next" }).click();
  await page
    .getByTestId(`calendar-cell-${istDay(ahead)}`)
    .getByTestId(`calendar-entry-${later}`)
    .click();
  const details = page.getByTestId("calendar-details");
  await expect(details).toContainText("Arrives at");
  await expect(
    details.getByRole("img", { name: "Opens when it arrives" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // Today's task, opened from the day view, lands on the board.
  await page.getByTestId("calendar-today").click();
  await page.getByTestId("calendar-view-day").click();
  await page.getByTestId(`calendar-entry-${now}`).click();
  await page.getByTestId("calendar-open-task").click();
  await expect(page).toHaveURL(/\/workspace/);
  await expect(page.getByRole("dialog", { name: now })).toBeVisible();
});

test("calendar on a phone: a day timeline with a week strip, and an agenda @mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "meera-dev");
  await page.getByTestId("open-calendar").click();
  await expect(page.getByTestId("calendar-timeline")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Week" })).toBeVisible();
  await expect(page.getByTestId("calendar-view-week")).toHaveCount(0);
  await page.getByTestId("calendar-view-agenda").click();
  const agenda = page.getByTestId("calendar-agenda");
  await expect(
    agenda
      .getByRole("region", { name: "Today" })
      .or(agenda.getByRole("region", { name: "Tomorrow" }))
      .first(),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
});
