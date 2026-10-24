import { expect, type APIRequestContext, type Page } from "@playwright/test";

export type SeedUser = "asha-dev" | "ravi-dev" | "meera-dev" | "nora-dev" | "anits-tpo" | "admin-demo";

/**
 * Signs in a test account through the API's dev login (refused when APP_ENV=production), then
 * lets /login send them home like a real GitHub sign-in would.
 */
export async function signIn(page: Page, login: SeedUser) {
  const res = await page.request.post("/api/v1/auth/dev-login", { data: { github_login: login }, headers: { "X-Client": "web" } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/login");
  await page.waitForURL(/\/(workspace|admin)/);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** Opens a student's conversation with a persona (desktop layout). */
export async function openChat(page: Page, persona: string) {
  await page.getByRole("navigation", { name: "Chats" }).getByTestId(`thread-${persona}`).click();
  await expect(page.getByRole("region", { name: "Conversation" }).getByRole("heading", { name: persona })).toBeVisible();
}

/** An API access token for a seeded login (dev login), for setting up data without the UI. */
export async function apiToken(request: APIRequestContext, login: string): Promise<string> {
  const res = await request.post("/api/v1/auth/dev-login", { data: { github_login: login }, headers: { "X-Client": "web" } });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

/** JSON request to the API with a bearer token. */
export async function api<T>(request: APIRequestContext, token: string, method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(`/api${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, "X-Client": "web" } });
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** First sign-in: accept the privacy notice and terms (the button waits for the checkbox). */
export async function acceptConsent(page: Page) {
  await expect(page.getByTestId("consent-accept")).toBeDisabled();
  await page.getByTestId("consent-check").click();
  await page.getByTestId("consent-accept").click();
  await expect(page.getByTestId("consent-accept")).toHaveCount(0);
}
