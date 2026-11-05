import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { api, apiToken, expectToast, signIn, unique } from "./helpers";

type Document = { title: string; body: string };
type DocumentTask = { id: string; title: string; content: { documents?: Document[] } };
type Template = { id: string; version: number; title: string; content: { documents?: Document[] } };
type FlowDetail = { flow: { id: string }; draft: { items: { title: string; content: { documents?: Document[] } }[] } | null };

const lesson = [
  "# Reason about state changes",
  "",
  "Predict the result before changing **state**. Record what you expected and observed.",
  "",
  "## Acceptance checks",
  "",
  "- [ ] Explain the starting state",
  "- [x] Check an empty collection",
  "",
  "| Input | Expected |",
  "| --- | --- |",
  "| Empty list | Clear empty state |",
  "",
  "```js",
  "const next = items.filter((item) => item.active);",
  "```",
  "",
  "> Explain why the original array remains unchanged.",
  "",
  "[Unsafe action](javascript:alert('unsafe-document'))",
  "![Tracking image](https://task-documents-image.invalid/pixel.png)",
  "<script>window.documentLessonExecuted = true</script>",
  '<img src="invalid" onerror="window.documentLessonExecuted = true">',
].join("\n");

async function enrollmentFor(request: APIRequestContext, token: string, login: string): Promise<string> {
  const result = await api<{ items: { enrollment: { id: string } }[] }>(request, token, "GET", `/v1/admin/students?q=${login}`);
  const id = result.items[0]?.enrollment.id;
  if (!id) throw new Error(`No fixture enrollment for ${login}`);
  return id;
}

async function openStudentTask(page: Page, title: string) {
  const tasks = page.getByRole("tab", { name: "Tasks", exact: true });
  if (await tasks.isVisible()) await tasks.click();
  await page.getByRole("button", { name: title, exact: true }).click();
}

test("authored Markdown: import, preview, assign and read safely inside the task @mobile", async ({ browser, page }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  const taskTitle = unique("Practice safe state transitions");
  const docTitle = unique("State transition field guide");
  try {
    await signIn(admin, "admin-demo");
    await admin.getByTestId("student-asha-dev").click();
    await admin.getByTestId("open-assign").click();
    await admin.getByLabel("Type", { exact: true }).click();
    await admin.getByRole("option", { name: "Doc reading" }).click();
    await admin.getByLabel("Title", { exact: true }).fill(taskTitle);
    await admin.getByLabel("Brief", { exact: true }).fill("Read the **field guide** below, then explain one edge case in your notes.");
    await admin.getByLabel("Import Markdown", { exact: true }).setInputFiles({ name: "state-guide.md", mimeType: "text/markdown", buffer: Buffer.from(lesson) });
    await admin.getByLabel("Document 1 title", { exact: true }).fill(docTitle);
    await expect(admin.getByLabel("Document 1 Markdown", { exact: true })).toHaveValue(lesson);
    await admin.getByRole("button", { name: "Preview document 1", exact: true }).click();
    await expect(admin.getByRole("heading", { name: "Reason about state changes", exact: true })).toBeVisible();
    await admin.getByRole("radio", { name: "In 2 hours", exact: true }).click();
    await admin.getByTestId("assign-submit").click();
    await expectToast(admin, `Assigned “${taskTitle}”`);

    await signIn(page, "asha-dev");
    await openStudentTask(page, taskTitle);
    await expect(page.locator("strong").filter({ hasText: /^field guide$/ })).toBeVisible();
    const taskUrl = page.url();
    let popups = 0;
    const imageRequests: string[] = [];
    page.on("popup", () => { popups += 1; });
    page.on("request", (request) => { if (request.url().includes("task-documents-image.invalid")) imageRequests.push(request.url()); });
    await page.getByRole("button", { name: `Read ${docTitle}`, exact: true }).click();
    const reader = page.getByTestId("document-reader");
    await expect(reader).toBeVisible();
    await expect(page.getByRole("dialog", { name: docTitle, exact: true })).toBeVisible();
    await expect(reader.getByRole("heading", { name: "Reason about state changes", exact: true })).toBeVisible();
    await expect(reader.getByRole("table")).toContainText("Clear empty state");
    await expect(reader.locator("pre code")).toContainText("items.filter");
    await expect(reader.getByRole("checkbox")).toHaveCount(2);
    await expect(reader.locator("img, script, iframe")).toHaveCount(0);
    await expect(reader.locator('a[href^="javascript:"]')).toHaveCount(0);
    expect(await page.evaluate(() => "documentLessonExecuted" in window)).toBe(false);
    expect(page.url()).toBe(taskUrl);
    expect(popups).toBe(0);
    expect(imageRequests).toEqual([]);
    await page.getByRole("button", { name: "Back to task", exact: true }).click();
    await expect(reader).toBeHidden();
    await expect(page.getByRole("heading", { name: taskTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Read ${docTitle}`, exact: true })).toBeVisible();
    expect(page.url()).toBe(taskUrl);
  } finally {
    await adminContext.close();
  }
});

test("library Markdown is copied into a flow and later library edits preserve that lesson snapshot", async ({ page, request }) => {
  const title = unique("Documented retry strategy");
  const document = { title: "Retries without duplicate work", body: "# Retry deliberately\n\nKeep the operation id stable.\n\n- [ ] Explain the failure case\n- [ ] Check duplicate requests" };
  await signIn(page, "admin-demo");
  await page.goto("/admin/library");
  await page.getByTestId("new-template").click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Document 1 title", { exact: true }).fill(document.title);
  await page.getByLabel("Document 1 Markdown", { exact: true }).fill(document.body);
  await page.getByTestId("template-save").click();
  await expectToast(page, `Added “${title}” to the library`);
  await page.getByLabel("Search tasks", { exact: true }).fill(title);
  await page.getByTestId(`template-row-${title}`).click();
  await expect(page.getByLabel("Document 1 Markdown", { exact: true })).toHaveValue(document.body);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();

  const token = await apiToken(request, "admin-demo");
  const templates = await api<{ items: Template[] }>(request, token, "GET", `/v1/admin/task-templates?q=${encodeURIComponent(title)}`);
  const template = templates.items.find((item) => item.title === title);
  if (!template) throw new Error("Authored library task was not persisted");
  expect(template.content.documents).toEqual([document]);
  const flow = await api<FlowDetail>(request, token, "POST", "/v1/admin/flows", { name: unique("Reader course"), stream: "Frontend", days: 30, description: "Task document snapshot regression" });
  await page.goto(`/admin/flows/${flow.flow.id}`);
  await page.getByTestId("day-3").click();
  await page.getByTestId("add-from-library").click();
  await page.getByLabel("Search the library", { exact: true }).fill(title);
  await page.getByRole("dialog").getByRole("checkbox", { name: new RegExp(title) }).check();
  await page.getByTestId("library-add").click();
  await page.getByTestId(`item-${title}`).getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByLabel("Document 1 Markdown", { exact: true })).toHaveValue(document.body);
  await page.getByTestId("item-save").click();
  await page.getByTestId("save-draft").click();
  await expectToast(page, "Draft saved");
  const saved = await api<FlowDetail>(request, token, "GET", `/v1/admin/flows/${flow.flow.id}`);
  expect(saved.draft?.items.find((item) => item.title === title)?.content.documents).toEqual([document]);

  await page.goto("/admin/library");
  await page.getByLabel("Search tasks", { exact: true }).fill(title);
  await page.getByTestId(`template-row-${title}`).click();
  await page.getByLabel("Document 1 Markdown", { exact: true }).fill("# A later library revision\n\nAlready assigned work keeps its own lesson.");
  await page.getByTestId("template-save").click();
  await expectToast(page, "Saved");
  const after = await api<FlowDetail>(request, token, "GET", `/v1/admin/flows/${flow.flow.id}`);
  expect(after.draft?.items.find((item) => item.title === title)?.content.documents).toEqual([document]);
});

test("document reader fits a dark phone viewport and legacy tasks still open @mobile", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const token = await apiToken(request, "admin-demo");
  const enrollment = await enrollmentFor(request, token, "asha");
  const title = unique("Read the embedded responsive guide");
  const docTitle = "Responsive without a detour";
  await api<DocumentTask>(request, token, "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "doc_reading", title, review_mode: "self", brief: "Open the lesson without leaving your task.",
    due_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    content: { resources: [], quiz: null, documents: [{ title: docTitle, body: `${lesson}\n\n\`\`\`text\n${"long_code_token_".repeat(35)}\n\`\`\`` }] },
  });
  const legacyTitle = unique("Legacy task without authored documents");
  await api<DocumentTask>(request, token, "POST", `/v1/admin/enrollments/${enrollment}/tasks`, {
    type: "standup", title: legacyTitle, review_mode: "self", brief: "Explain what shipped today.",
    due_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    content: { resources: [], quiz: null },
  });
  await signIn(page, "asha-dev");
  await openStudentTask(page, title);
  await page.getByRole("button", { name: `Read ${docTitle}`, exact: true }).click();
  const reader = page.getByTestId("document-reader");
  await expect(reader.getByRole("heading", { name: "Acceptance checks", exact: true })).toBeVisible();
  const bounds = await reader.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Back to task", exact: true }).click();
  await expect(reader).toBeHidden();
  await page.getByRole("dialog", { name: title, exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await openStudentTask(page, legacyTitle);
  await expect(page.getByText("Explain what shipped today.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("task-documents")).toHaveCount(0);
  await expect(page.getByTestId("move-in_progress")).toBeVisible();
});
