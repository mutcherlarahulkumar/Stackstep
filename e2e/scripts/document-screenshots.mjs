// Focused task-document design review. Creates one task in the local fixture enrollment;
// never resets a database. Run with API/web already running:
// PW_CHROMIUM_PATH=/usr/bin/chromium node scripts/document-screenshots.mjs <out-dir>
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const output = process.argv[2];
if (!output) throw new Error("Pass a screenshot output directory.");
await mkdir(output, { recursive: true });
const baseURL = process.env.WEB_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const title = `Build a useful project filter ${Date.now().toString(36)}`;
const documentTitle = "A small feature, reviewed carefully";
const body = `# Build a useful project filter

**Timebox:** 45–60 minutes · **Prerequisite:** render a list with stable keys.

You are improving a teammate's portfolio. A visitor should find relevant work without
guessing which filters are active. Predict the result before writing the implementation.

## Your learning goals

- Derive visible projects from data rather than keeping duplicate state.
- Combine text search and a selected tag with an explicit rule.
- Explain an empty result to a visitor and offer a way to recover.

## Work in small steps

1. Write three example projects: one React, one Go, and one using both.
2. Label the search input and make tag selection keyboard accessible.
3. Apply the selected tag **and** case-insensitive title search.
4. Test clearing search, clearing tags, and combining both inputs.

\`\`\`js
// Describe this case before coding:
const query = "  REACT  ";
const selectedTag = "frontend";
// Which projects should remain visible, and why?
\`\`\`

| Situation | Expected behavior |
| --- | --- |
| No active filters | Show every project |
| Mixed-case search | Match without case sensitivity |
| No matches | Show a clear empty state and a reset action |

## Acceptance checks

- [ ] Search and tag filters combine rather than overwrite each other.
- [ ] A keyboard user can reach every control and see focus.
- [ ] Reset restores all projects and announces the visible count.
- [ ] The layout works at 360 px without horizontal page scrolling.

> If the displayed list becomes stale, inspect the source of truth before adding another effect.

## Hand in evidence

Open a pull request with your test cases and a short explanation of a bug you caught.
Add one screenshot at phone width. In your notes, explain what you would test next.
`;

async function api(login, method, path, data) {
  const loginResponse = await fetch(`${baseURL}/api/v1/auth/dev-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client": "web" }, body: JSON.stringify({ github_login: login }),
  });
  if (!loginResponse.ok) throw new Error(`Fixture login failed: ${loginResponse.status}`);
  const { access_token: token } = await loginResponse.json();
  const response = await fetch(`${baseURL}/api${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Client": "web" }, body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function signIn(page, login) {
  const response = await page.request.post("/api/v1/auth/dev-login", { data: { github_login: login }, headers: { "X-Client": "web" } });
  if (!response.ok()) throw new Error(`Fixture login failed: ${response.status()}`);
  await page.goto("/login");
  await page.waitForURL(/\/(workspace|admin)/);
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: "disabled" });
  console.log(`${name}.png`);
}

try {
  const students = await api("admin-demo", "GET", "/v1/admin/students?q=asha");
  const enrollment = students.items[0]?.enrollment.id;
  if (!enrollment) throw new Error("Asha's fixture enrollment is required.");
  await api("admin-demo", "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "doc_reading", title, brief: "Use the in-app lesson to plan, implement, and review a **small accessible feature**.",
    review_mode: "self", due_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
    content: { resources: [], quiz: null, documents: [{ title: documentTitle, body }] },
  });

  const authorContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const author = await authorContext.newPage();
  await signIn(author, "admin-demo");
  await author.getByTestId("student-asha-dev").click();
  await author.getByTestId("open-assign").click();
  await author.getByLabel("Title", { exact: true }).fill(title);
  await author.getByLabel("Import Markdown", { exact: true }).setInputFiles({ name: "project-filter.md", mimeType: "text/markdown", buffer: Buffer.from(body) });
  await author.getByLabel("Document 1 title", { exact: true }).fill(documentTitle);
  await author.getByTestId("documents-editor").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await capture(author, "01-document-editor-desktop");
  await author.getByRole("button", { name: "Preview document 1", exact: true }).click();
  await expect(author.getByRole("heading", { name: "Build a useful project filter", exact: true })).toBeVisible();
  await capture(author, "02-document-preview-desktop");
  await authorContext.close();

  for (const { name, width, height, theme } of [
    { name: "03-reader-desktop-light", width: 1440, height: 1000, theme: "light" },
    { name: "04-reader-desktop-dark", width: 1440, height: 1000, theme: "dark" },
    { name: "05-reader-phone-light", width: 390, height: 844, theme: "light" },
    { name: "06-reader-phone-dark", width: 390, height: 844, theme: "dark" },
  ]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await signIn(page, "asha-dev");
    const tasks = page.getByRole("tab", { name: "Tasks", exact: true });
    if (await tasks.isVisible()) await tasks.click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: `Read ${documentTitle}`, exact: true }).click();
    await expect(page.getByTestId("document-reader").getByRole("heading", { name: "Build a useful project filter", exact: true })).toBeVisible();
    await capture(page, name);
    await context.close();
  }
} finally {
  await browser.close();
}
