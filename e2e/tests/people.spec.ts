import { expect, test, type Page } from "@playwright/test";

import { expectToast, openChat, signIn } from "./helpers";

const suffix = Date.now().toString(36);

/** Picks an option in a shadcn (Radix) Select by its label. */
async function choose(page: Page, scope: ReturnType<Page["getByRole"]> | Page, label: string, option: string | RegExp) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

/** Signs in through the API's dev login (any existing login) and opens the workspace. */
async function devSignIn(page: Page, login: string) {
  const res = await page.request.post("/api/v1/auth/dev-login", { data: { github_login: login }, headers: { "X-Client": "web" } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/workspace");
}

test("people: colleges, cohorts, enroll by login, roster import, internship status and staff (PE1–PE6, PI1–PI3, PS1, PR1–PR3)", async ({ browser }) => {
  const college = `E2E College ${suffix}`;
  const cohort = `E2E Batch ${suffix}`;
  const login = `e2e-${suffix}`;
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByRole("link", { name: "People" }).click();
  await expect(admin.getByRole("heading", { name: "People" })).toBeVisible();

  // A college and a cohort with two seats.
  await admin.getByRole("tab", { name: "Colleges & cohorts" }).click();
  await admin.getByTestId("open-new-college").click();
  let dialog = admin.getByRole("dialog");
  await dialog.getByLabel("College name").fill(college);
  await dialog.getByTestId("college-save").click();
  await expectToast(admin, `Added ${college}`);
  await expect(admin.getByTestId(`college-${college}`)).toBeVisible();

  await admin.getByTestId("open-new-cohort").click();
  dialog = admin.getByRole("dialog");
  await dialog.getByTestId("cohort-save").click();
  await expect(dialog.getByText("Give the cohort a name")).toBeVisible();
  await dialog.getByLabel("Name").fill(cohort);
  await choose(admin, dialog, "College", college);
  await choose(admin, dialog, "Program", /frontend-30/);
  await dialog.getByLabel("Seats").fill("2");
  await dialog.getByTestId("cohort-save").click();
  await expectToast(admin, `Added ${cohort}`);
  await expect(admin.getByTestId(`cohort-${cohort}`)).toContainText("0/2");

  // Enroll a login that has never signed in, on the React flow.
  await admin.getByRole("tab", { name: "Enroll" }).click();
  const one = admin.locator("form").first();
  await admin.getByTestId("enroll-submit").click();
  await expect(one.getByText("Enter a GitHub username")).toBeVisible();
  await one.getByLabel("GitHub username").fill(`@${login}`);
  await one.getByLabel("Name (optional)").fill("Eesha Test");
  await choose(admin, one, "Cohort", new RegExp(cohort));
  await choose(admin, one, "Flow (optional)", /React Frontend/);
  await admin.getByTestId("enroll-submit").click();
  await expectToast(admin, `Enrolled @${login}`);

  // Roster import: bad rows are flagged before sending; the seat limit is reported per row.
  const roster = admin.locator("form").nth(1);
  await roster.getByLabel("Roster").fill(`github_login,name\nroster-a-${suffix},Roster A\nnot valid,Nope\nroster-b-${suffix},Roster B`);
  await expect(admin.getByTestId("roster-count")).toHaveText("2 ready, 1 to fix");
  await expect(admin.getByTestId("roster-problems")).toContainText("Not a valid GitHub username");
  await choose(admin, roster, "Cohort", new RegExp(cohort));
  await admin.getByTestId("import-submit").click();
  const results = admin.getByTestId("import-results");
  await expect(results).toContainText(`@roster-a-${suffix}`);
  await expect(results.getByText("Enrolled")).toHaveCount(1);
  await expect(results).toContainText("seats in this cohort are taken");

  // The new student signs in (dev login stands in for GitHub) and is welcomed by the lead.
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await devSignIn(student, login);
  await openChat(student, "Sam Rivera");
  await expect(student.getByRole("region", { name: "Conversation" }).getByText(/Welcome to Stackstep, Eesha/)).toBeVisible();

  // Pause from the student detail; the student sees it.
  await admin.goto("/admin");
  await admin.getByLabel("Search students").fill(login);
  await admin.getByTestId(`student-${login}`).click();
  await admin.getByTestId("internship-status").click();
  await admin.getByTestId("status-paused").click();
  await admin.getByTestId("confirm-status").click();
  await expectToast(admin, "internship is now paused");
  await student.reload();
  await expect(student.getByText("Internship paused").first()).toBeVisible();

  // Staff: a college admin for the new college sees only that college; revoking removes access.
  await admin.goto("/admin/people");
  await admin.getByRole("tab", { name: "Staff" }).click();
  await admin.getByTestId("open-add-staff").click();
  dialog = admin.getByRole("dialog");
  await dialog.getByLabel("GitHub username").fill(`tpo-${suffix}`);
  await choose(admin, dialog, "College", college);
  await dialog.getByTestId("staff-save").click();
  await expectToast(admin, `@tpo-${suffix} is now a college admin for ${college}`);
  const tpo = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await tpo.request.post("/api/v1/auth/dev-login", { data: { github_login: `tpo-${suffix}` }, headers: { "X-Client": "web" } });
  await tpo.goto("/admin");
  await expect(tpo.getByTestId(`student-${login}`)).toBeVisible();
  await expect(tpo.getByTestId("student-asha-dev")).toHaveCount(0);

  await admin.getByTestId(`staff-tpo-${suffix}`).getByRole("button", { name: "Revoke" }).click();
  await admin.getByTestId("confirm-revoke-staff").click();
  await expectToast(admin, "no longer has admin access");
  await expect(admin.getByTestId(`staff-tpo-${suffix}`)).toHaveCount(0);
  await expect(admin.getByTestId("staff-admin-demo")).toContainText("You");
});
