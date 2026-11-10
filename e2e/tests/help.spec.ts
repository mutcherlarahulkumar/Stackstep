import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("anyone can ask the help assistant, even signed out (HB1, HB6)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("help-open").click();
  const panel = page.getByTestId("help-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("help-input").fill("How do I hand in my work?");
  await panel.getByTestId("help-send").click();
  const answer = panel.getByTestId("help-a").last();
  await expect(answer).toContainText("Handing in work");
  await expect(answer).toContainText(/Based on|From the guide/);
  // A suggestion asks straight away after starting over.
  await panel.getByRole("button", { name: "Start over" }).click();
  await panel.getByTestId("help-suggestion").first().click();
  await expect(panel.getByTestId("help-q")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("students take the workspace tour from the account menu (TR1, TR2)", async ({ page }) => {
  await signIn(page, "asha-dev");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByTestId("menu-tour").click();
  const tour = page.getByTestId("tour");
  await expect(tour.getByRole("heading", { name: "Welcome to your workspace" })).toBeVisible();
  await tour.getByTestId("tour-next").click();
  await expect(tour.getByRole("heading", { name: "Your team's chats" })).toBeVisible();
  // Arrow keys move through it; Finish ends it.
  for (let i = 0; i < 12; i++) {
    const finish = tour.getByRole("button", { name: "Finish" });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page.keyboard.press("ArrowRight");
  }
  await expect(tour).toBeHidden();
  // The help panel offers the tour too.
  await page.getByTestId("help-open").click();
  await page.getByTestId("help-tour").click();
  await expect(tour).toBeVisible();
  await tour.getByTestId("tour-close").click();
  await expect(tour).toBeHidden();
});

test("admins get a console tour, and no help assistant (TR3)", async ({ page }) => {
  await signIn(page, "admin-demo");
  await expect(page.getByTestId("help-open")).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByTestId("menu-tour").click();
  const tour = page.getByTestId("tour");
  await expect(tour.getByRole("heading", { name: "Welcome to the console" })).toBeVisible();
  await tour.getByTestId("tour-next").click();
  await expect(tour.getByRole("heading", { name: "Students" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
});
