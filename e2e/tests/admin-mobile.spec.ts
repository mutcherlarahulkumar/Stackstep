import { expect, test } from "@playwright/test";

import { signIn, unique } from "./helpers";

test.describe("admin on a phone @mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("console asks for desktop, but task allocation works (U1)", async ({ page }) => {
    await signIn(page, "anits-tpo");
    await expect(page.getByTestId("desktop-gate")).toBeVisible();
    await expect(page.getByRole("region", { name: "Student detail" })).toHaveCount(0);

    await page.getByRole("link", { name: "Assign a task" }).click();
    await expect(page).toHaveURL(/\/admin\/assign$/);
    // College admins only see their college's students.
    await expect(page.getByTestId("student-meera-dev")).toHaveCount(0);
    await page.getByLabel("Search students").fill("ravi");
    await page.getByTestId("student-ravi-dev").click();

    const title = unique("Read MDN on fetch");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Doc reading" }).click();
    await page.getByTestId("assign-submit").click();
    await expect(page.getByTestId("assign-success")).toContainText(title);
  });

  test("paused internships can't receive tasks", async ({ page }) => {
    await signIn(page, "anits-tpo");
    await page.goto("/admin/assign");
    await page.getByTestId("student-kiran-dev").click();
    await expect(page.getByText(/internship is paused/)).toBeVisible();
    await expect(page.getByTestId("assign-submit")).toBeDisabled();
  });

  test("student on a phone switches between chats and tasks", async ({ page }) => {
    await signIn(page, "asha-dev");
    await expect(page.getByRole("tab", { name: /Chats/ })).toHaveAttribute("aria-selected", "true");
    // One chat per persona; opening one shows the conversation with a way back.
    await page.getByTestId("thread-Sam Rivera").click();
    await expect(page.getByLabel("Message Sam Rivera")).toBeVisible();
    await page.getByRole("button", { name: "All chats" }).click();
    await page.getByRole("tab", { name: "Tasks" }).click();
    await expect(page.getByRole("radio", { name: /Today/ })).toBeVisible();
  });

  test("flows, library and personas ask for desktop; inbox works on the phone (U5)", async ({ page }) => {
    await signIn(page, "admin-demo");
    for (const path of ["/admin/flows", "/admin/library", "/admin/personas", "/admin"]) {
      await page.goto(path);
      await expect(page.getByTestId("desktop-gate")).toBeVisible();
    }
    await page.getByRole("link", { name: "Open inbox" }).click();
    await expect(page).toHaveURL(/\/admin\/inbox$/);
    // The previous page may stay mounted but hidden (Next keeps route state), so check visibility.
    await expect(page.getByTestId("desktop-gate")).toBeHidden();
    const thread = page.getByTestId("staff-thread-asha-dev-Sam Rivera");
    await expect(thread).toBeVisible();
    await thread.click();
    await expect(page.getByText(/You reply as/)).toBeVisible();
    await expect(page.getByLabel("Message Asha Rao")).toBeVisible();
    await page.getByRole("button", { name: "All conversations" }).click();
    await expect(page.getByTestId("open-broadcast")).toBeVisible();
  });
});
