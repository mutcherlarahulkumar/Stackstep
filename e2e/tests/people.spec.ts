import { expect, test, type Page } from "@playwright/test";

import { acceptConsent, expectToast, openChat, signIn } from "./helpers";

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
  // A college on its own page.
  await admin.getByTestId("nav-setup").filter({ visible: true }).click();
  await admin.getByRole("menuitem", { name: /^Colleges/ }).click();
  await expect(admin.getByRole("heading", { name: "Colleges" })).toBeVisible();
  await expect(admin.getByRole("complementary", { name: "What a college is for" })).toBeVisible();
  // Explainers can be put away once read and brought back.
  await admin.getByRole("button", { name: 'Got it, hide "What a college is for"' }).click();
  await expect(admin.getByRole("complementary", { name: "What a college is for" })).toHaveCount(0);
  await admin.getByTestId("info-note-show").filter({ visible: true }).click();
  await expect(admin.getByRole("complementary", { name: "What a college is for" })).toBeVisible();
  await admin.getByTestId("open-new-college").click();
  let dialog = admin.getByRole("dialog");
  await dialog.getByLabel("College name").fill(college);
  await dialog.getByTestId("college-save").click();
  await expectToast(admin, `Added ${college}`);
  await expect(admin.getByTestId(`college-${college}`)).toBeVisible();

  // A cohort with two seats, on the Cohorts page.
  await admin.getByTestId("nav-setup").filter({ visible: true }).click();
  await admin.getByRole("menuitem", { name: /^Cohorts/ }).click();
  await expect(admin.getByRole("complementary", { name: "What a cohort is" })).toBeVisible();
  await admin.getByTestId("open-new-cohort").click();
  dialog = admin.getByRole("dialog");
  await dialog.getByTestId("cohort-save").click();
  await expect(dialog.getByText("Give the cohort a name")).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill(cohort);
  await choose(admin, dialog, "College", college);
  await choose(admin, dialog, "Program", /frontend-30/);
  await dialog.getByLabel("Seats").fill("2");
  // Taking applications needs a fee.
  await dialog.getByTestId("cohort-open").click();
  await dialog.getByTestId("cohort-save").click();
  await expect(dialog.getByText("Set a fee to take applications.")).toBeVisible();
  await dialog.getByTestId("cohort-open").click();
  await dialog.getByTestId("cohort-save").click();
  await expectToast(admin, `Added ${cohort}`);
  await expect(admin.getByTestId(`cohort-${cohort}`)).toContainText("0/2");

  await admin.getByTestId("nav-setup").filter({ visible: true }).click();
  await admin.getByRole("menuitem", { name: /^People/ }).click();
  await expect(admin.getByRole("heading", { name: "People" })).toBeVisible();

  // Enroll a login that has never signed in, on the React flow.
  await expect(admin.getByRole("complementary", { name: "Enroll students by hand" })).toBeVisible();
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
  await admin.getByTestId("enroll-mode-csv").click();
  const roster = admin.locator("form").first();
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
  // First visit (AC1–AC3): accept the terms, then walk the four-step guide.
  await acceptConsent(student);
  const guide = student.getByTestId("onboarding");
  await expect(guide).toContainText("Step 1 of 4");
  for (let i = 0; i < 3; i++) await guide.getByTestId("onboarding-next").click();
  await expect(guide).toContainText("Points, credits and the AI helper");
  await guide.getByTestId("onboarding-done").click();
  await expect(guide).toHaveCount(0);
  await student.reload();
  await expect(student.getByTestId("consent-accept")).toHaveCount(0);
  await expect(student.getByTestId("onboarding")).toHaveCount(0);
  await openChat(student, "Sam Rivera");
  await expect(student.getByTestId("persona-tag")).toBeVisible();
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
  await acceptConsent(tpo);
  await expect(tpo.getByTestId(`student-${login}`)).toBeVisible();
  await expect(tpo.getByTestId("student-asha-dev")).toHaveCount(0);

  await admin.getByTestId(`staff-tpo-${suffix}`).getByRole("button", { name: "Revoke" }).click();
  await admin.getByTestId("confirm-revoke-staff").click();
  await expectToast(admin, "no longer has admin access");
  await expect(admin.getByTestId(`staff-tpo-${suffix}`)).toHaveCount(0);
  await expect(admin.getByTestId("staff-admin-demo")).toContainText("You");
});
