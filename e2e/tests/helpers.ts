import { expect, type Page } from "@playwright/test";

export type SeedUser = "asha-dev" | "ravi-dev" | "nora-dev" | "anits-tpo" | "admin-demo";

/** Signs in through the developer panel on /login (the API refuses this in production). */
export async function signIn(page: Page, login: SeedUser) {
  await page.goto("/login");
  await page.getByTestId(`dev-${login}`).click();
  await page.waitForURL(/\/(workspace|admin)/);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
