import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { api, apiToken, expectToast, signIn } from "./helpers";

test("notifications: opt in, then a background tab hears about new messages; the title counts unread (NT1, NT4)", async ({ browser, request }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["notifications"] });
  // Pretend the tab is in the background and record notifications instead of showing them.
  await ctx.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const shown: { title: string; body: string }[] = [];
    (window as unknown as { __notes: typeof shown }).__notes = shown;
    class FakeNotification {
      static permission = "granted";
      static requestPermission = () => Promise.resolve("granted");
      onclick: (() => void) | null = null;
      constructor(title: string, opts: { body?: string }) {
        shown.push({ title, body: opts.body ?? "" });
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: FakeNotification });
  });
  const page = await ctx.newPage();
  await signIn(page, "meera-dev");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByTestId("toggle-notifications").click();
  await expectToast(page, "Notifications on");

  // An admin writes to Meera as her team lead.
  const admin = await apiToken(request, "admin-demo");
  const s = await api<{ items: { enrollment: { id: string } }[] }>(request, admin, "GET", "/v1/admin/students?q=meera");
  const lead = "00000000-0000-4000-8000-000000000001";
  await api(request, admin, "POST", `/v1/admin/threads/${s.items[0]?.enrollment.id ?? ""}/${lead}/messages`, { client_id: randomUUID(), body: "Quick sync at 4?" });

  await expect.poll(() => page.evaluate(() => (window as unknown as { __notes: { title: string; body: string }[] }).__notes)).toContainEqual({ title: "Sam Rivera", body: "Quick sync at 4?" });
  await expect.poll(() => page.title()).toMatch(/^\(\d+\) /);
});
