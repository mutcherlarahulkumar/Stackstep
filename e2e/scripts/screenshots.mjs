// Captures the key screens for design review: node scripts/screenshots.mjs <out-dir> (servers must be running).
import { chromium } from "@playwright/test";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
async function shoot(name, login, path, { width = 1440, height = 900, dark = false, before } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? "dark" : "light", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  if (login) {
    await page.goto("http://localhost:3000/login");
    await page.getByTestId(`dev-${login}`).click();
    await page.waitForURL(/workspace|admin/);
  }
  if (path) await page.goto("http://localhost:3000" + path);
  await page.waitForTimeout(1200);
  if (before) await before(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
await shoot("01-landing", null, "/");
await shoot("02-login", null, "/login");
await shoot("03-workspace", "asha-dev", "/workspace");
await shoot("04-workspace-dark", "asha-dev", "/workspace", { dark: true });
await shoot("05-task-sheet", "asha-dev", "/workspace", { before: async (p) => { await p.getByRole("region", { name: "Task board" }).getByRole("radio", { name: /Done/ }).click(); await p.waitForTimeout(300); const b = p.getByRole("region", { name: "Task board" }).locator("li button").first(); if (await b.count()) { await b.click(); await p.waitForTimeout(500);} } });
await shoot("06-admin", "admin-demo", "/admin", { before: async (p) => { await p.getByTestId("student-asha-dev").click(); await p.waitForTimeout(800); } });
await shoot("07-admin-assign-sheet", "admin-demo", "/admin", { before: async (p) => { await p.getByTestId("student-asha-dev").click(); await p.getByTestId("open-assign").click(); await p.getByTestId("assign-submit").click(); await p.waitForTimeout(500); } });
await shoot("08-admin-phone-gate", "anits-tpo", "/admin", { width: 390, height: 844 });
await shoot("09-assign-phone", "anits-tpo", "/admin/assign", { width: 390, height: 844, before: async (p) => { await p.getByTestId("student-asha-dev").click(); await p.waitForTimeout(400); } });
await shoot("10-student-phone", "asha-dev", "/workspace", { width: 390, height: 844, dark: true });
await shoot("11-no-enrollment", "nora-dev", "/workspace");
await shoot("12-workspace-flow", "meera-dev", "/workspace");
await shoot("13-flows", "admin-demo", "/admin/flows");
await shoot("14-flow-builder", "admin-demo", "/admin/flows/00000000-0000-4000-8000-0000000000f1", { before: async (p) => { await p.getByTestId("day-3").click(); await p.waitForTimeout(300); } });
await shoot("15-flow-item", "admin-demo", "/admin/flows/00000000-0000-4000-8000-0000000000f1", { before: async (p) => { await p.getByTestId("day-2").click(); await p.getByTestId("item-Two Sum").getByRole("button", { name: "Two Sum", exact: true }).click(); await p.waitForTimeout(500); } });
await shoot("16-library", "admin-demo", "/admin/library");
await shoot("17-personas", "admin-demo", "/admin/personas");
await shoot("18-inbox", "admin-demo", "/admin/inbox", { before: async (p) => { await p.getByTestId("staff-thread-asha-dev-Sam Rivera").click(); await p.waitForTimeout(600); } });
await shoot("19-broadcast", "admin-demo", "/admin/inbox", { before: async (p) => { await p.getByTestId("open-broadcast").click(); await p.waitForTimeout(500); } });
await shoot("20-inbox-phone", "admin-demo", "/admin/inbox", { width: 390, height: 844, dark: true });
await shoot("21-student-chats-phone", "meera-dev", "/workspace", { width: 390, height: 844 });
await browser.close();
