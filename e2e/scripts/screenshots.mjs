// Captures the key screens for design review: node scripts/screenshots.mjs <out-dir> (servers must be running).
import { chromium } from "@playwright/test";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
async function shoot(name, login, path, { width = 1440, height = 900, dark = false, before } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? "dark" : "light", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  if (login) {
    await page.request.post("http://localhost:3000/api/v1/auth/dev-login", { data: { github_login: login }, headers: { "X-Client": "web" } });
    await page.goto("http://localhost:3000/login");
    await page.waitForURL(/workspace|admin/);
  }
  if (path) await page.goto("http://localhost:3000" + path);
  await page.waitForTimeout(1200);
  if (before) await before(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
// Setup through the API so every shot has something to show: a DSA task with a practice pad,
// and one finished task so a certificate can be issued.
async function api(login, method, path, body) {
  const t = await (await fetch("http://localhost:3000/api/v1/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json", "X-Client": "web" }, body: JSON.stringify({ github_login: login }) })).json();
  const res = await fetch(`http://localhost:3000/api${path}`, { method, headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json", "X-Client": "web" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
const asha = (await api("admin-demo", "GET", "/v1/admin/students?q=asha")).items[0].enrollment.id;
const due = () => new Date(Date.now() + 3 * 3600e3).toISOString();
await api("admin-demo", "POST", `/v1/admin/enrollments/${asha}/tasks`, {
  type: "dsa", title: "Two Sum", brief: "Solve Two Sum in O(n). Explain your approach in two sentences.", due_at: due(),
  content: { resources: [], quiz: null, practice: { function_name: "twoSum", starter: "function twoSum(nums, target) {\n}\n", tests: [{ args: [[2, 7, 11, 15], 9], expected: [0, 1] }, { args: [[3, 2, 4], 6], expected: [1, 2] }] } },
});
const warm = await api("admin-demo", "POST", `/v1/admin/enrollments/${asha}/tasks`, { type: "standup", title: "Say hello to the team", brief: "One line about you.", review_mode: "self", due_at: due() });
await api("asha-dev", "POST", `/v1/tasks/${warm.id}/transitions`, { to: "in_progress", expected_version: warm.version, note: "" });
await api("asha-dev", "POST", `/v1/tasks/${warm.id}/transitions`, { to: "done", expected_version: warm.version + 1, note: "" });

await shoot("01-landing", null, "/");
await shoot("02-login", null, "/login");
await shoot("03-workspace", "asha-dev", "/workspace");
await shoot("04-workspace-dark", "asha-dev", "/workspace", { dark: true });
await shoot("05-task-sheet", "asha-dev", "/workspace", { before: async (p) => { await p.getByRole("region", { name: "Task board" }).getByRole("button", { name: "Two Sum", exact: true }).click(); await p.getByTestId("practice-run").click(); await p.waitForTimeout(800); } });
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
await shoot("22-ai-form", "meera-dev", "/workspace", { before: async (p) => { await p.getByTestId("thread-ai").first().click(); await p.getByTestId("ai-new").click(); await p.waitForTimeout(300); } });
await shoot("23-ai-answer", "meera-dev", "/workspace", {
  before: async (p) => {
    await p.getByTestId("thread-ai").first().click();
    await p.getByTestId("ai-new").click();
    await p.getByLabel("What are you trying to do?").fill("Center the hero section vertically on mobile with flexbox.");
    await p.getByLabel("What have you tried so far?").fill("I set display:flex and align-items:center on the section, but it stays at the top on small screens.");
    await p.getByTestId("ai-extras").click();
    await p.getByLabel("Relevant code (optional)").fill(".hero { display: flex; align-items: center; }");
    await p.getByTestId("ai-ask").click();
    await p.getByTestId("ai-answer").first().waitFor();
  },
});
await shoot("24-ai-phone", "meera-dev", "/workspace", { width: 390, height: 844, dark: true, before: async (p) => { await p.getByTestId("thread-ai").click(); await p.waitForTimeout(300); } });
await shoot("25-progress", "asha-dev", "/workspace", { before: async (p) => { await p.getByTestId("open-progress").click(); await p.waitForTimeout(500); } });
await shoot("26-issue-certificate", "admin-demo", "/admin", { before: async (p) => { await p.getByTestId("student-asha-dev").click(); await p.getByTestId("student-more").click(); await p.getByTestId("open-issue").click(); await p.waitForTimeout(500); } });
// Issue one so the public pages have something to show.
let code = "";
await shoot("27-certificate-issued", "admin-demo", "/admin", {
  before: async (p) => {
    await p.getByTestId("student-asha-dev").click();
    await p.getByTestId("student-more").click();
    await p.getByTestId("open-issue").click();
    await p.getByTestId("confirm-issue").click();
    code = (await p.getByTestId("view-certificate").innerText()).trim();
    await p.waitForTimeout(500);
  },
});
await shoot("28-verify-phone", null, `/verify/${code}`, { width: 390, height: 844 });
await shoot("29-certificate", null, `/certificate/${code}`);
await shoot("30-verify-dark", null, `/verify/${code}`, { dark: true });
await shoot("31-verify-unknown", null, "/verify/ABCDEFGHJK23", { width: 390, height: 844, dark: true });
await shoot("32-verify-lookup", null, "/verify", { width: 390, height: 844 });
await shoot("33-progress-phone", "asha-dev", "/workspace", { width: 390, height: 844, dark: true, before: async (p) => { await p.getByTestId("open-progress").click(); await p.waitForTimeout(500); } });
await shoot("34-overview", "admin-demo", "/admin/overview");
await shoot("35-overview-dark", "admin-demo", "/admin/overview", { dark: true });
await shoot("36-overview-student", "admin-demo", "/admin/overview", { before: async (p) => { await p.getByTestId("overview-row-asha-dev").getByRole("button").click(); await p.waitForTimeout(600); } });
await shoot("37-nudge", "admin-demo", "/admin/overview", { before: async (p) => { await p.getByTestId("open-nudge").click(); await p.waitForTimeout(500); } });
await shoot("38-people-enroll", "admin-demo", "/admin/people");
await shoot("39-people-cohorts", "admin-demo", "/admin/people", { before: async (p) => { await p.getByRole("tab", { name: "Colleges & cohorts" }).click(); await p.waitForTimeout(600); } });
await shoot("40-people-staff", "admin-demo", "/admin/people", { dark: true, before: async (p) => { await p.getByRole("tab", { name: "Staff" }).click(); await p.waitForTimeout(600); } });
await shoot("41-people-import", "admin-demo", "/admin/people", { before: async (p) => { await p.locator("form").nth(1).getByLabel("Roster").fill("github_login,name\nnew-one,New One\nbad login,Bad\nnew-one,Dup"); await p.waitForTimeout(400); } });
await shoot("42-status-menu", "admin-demo", "/admin", { before: async (p) => { await p.getByTestId("student-asha-dev").click(); await p.getByTestId("internship-status").click(); await p.waitForTimeout(400); } });
// Loading states: hold the API so the loaders stay on screen.
await shoot("43-loading-full", null, null, { before: async (p) => { await p.route("**/api/v1/auth/refresh", () => {}); await p.goto("http://localhost:3000/workspace"); await p.waitForTimeout(1500); } });
await shoot("44-loading-panel", "admin-demo", null, { before: async (p) => { await p.route("**/api/v1/admin/overview*", () => {}); await p.goto("http://localhost:3000/admin/overview"); await p.waitForTimeout(1500); } });
await shoot("45-ai-thinking", "ravi-dev", "/workspace", {
  before: async (p) => {
    await p.route("**/api/v1/me/ai/conversations", (r) => (r.request().method() === "POST" ? undefined : r.continue()));
    await p.getByTestId("thread-ai").first().click();
    await p.getByTestId("ai-new").click();
    await p.getByLabel("What are you trying to do?").fill("Center the hero section vertically on mobile with flexbox.");
    await p.getByLabel("What have you tried so far?").fill("I set display:flex and align-items:center on the section, but it stays at the top on small screens.");
    await p.getByTestId("ai-ask").click();
    await p.waitForTimeout(1200);
  },
});
await browser.close();
