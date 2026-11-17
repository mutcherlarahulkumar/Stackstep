import { expect, test, type Page } from "@playwright/test";

import { api, apiToken, signIn } from "./helpers";

/** Opens the student's team room from the chat list (desktop). */
async function openTeamRoom(page: Page) {
  await page.getByRole("navigation", { name: "Chats" }).getByTestId("thread-Team room").click();
  await expect(page.getByTestId("team-header")).toBeVisible();
}

test.describe("team room", () => {
  test("the student's team room has everyone, and an @mention picks who answers (TR1, TR3, TR4)", async ({ page }) => {
    await signIn(page, "asha-dev");
    await openTeamRoom(page);
    const log = page.getByTestId("chat-log");
    await expect(log).toContainText("Welcome to your team room");
    await expect(log).toContainText("Sam Rivera, Team Lead");
    await expect(page.getByTestId("team-speaker-name").first()).toContainText("Stackbot");

    // Typing @ suggests teammates; picking one fills in the mention.
    const input = page.locator("#chat-input");
    await input.fill("Quick one @sa");
    await page.getByTestId("mention-suggestions").getByRole("button", { name: /Sam/ }).click();
    await expect(input).toHaveValue("Quick one @Sam ");
    await input.pressSequentially("can you look at my branch?");
    await input.press("Enter");
    // Sam answers in the room (automatic, after the lead's reply delay).
    await expect(log.getByTestId("team-speaker-name").filter({ hasText: "Sam Rivera" })).toBeVisible({ timeout: 20_000 });
  });

  test("staff answer in a student's team room as any persona (TR5)", async ({ page, request }) => {
    const asha = await apiToken(request, "asha-dev");
    // Make sure the room exists (it opens on the student's first visit).
    await api(request, asha, "GET", "/v1/me/threads");
    await signIn(page, "admin-demo");
    await page.goto("/admin/inbox");
    await page.getByRole("button", { name: /Asha Rao/ }).first().click();
    await page.getByTestId("student-persona-Team room").click();
    await page.getByTestId("team-speaker").click();
    await page.getByRole("option", { name: /Priya Sharma/ }).click();
    await page.locator("#chat-input").fill("Demo moves to Friday at 4.");
    await page.locator("#chat-input").press("Enter");
    await expect(page.getByTestId("chat-log")).toContainText("Demo moves to Friday at 4.");

    const me = await api<{ enrollment: { id: string } }>(request, asha, "GET", "/v1/me");
    expect(me.enrollment.id).toBeTruthy();
    const page2 = await page.context().browser()?.newPage();
    if (!page2) throw new Error("no browser");
    await signIn(page2, "asha-dev");
    await openTeamRoom(page2);
    await expect(page2.getByTestId("chat-log")).toContainText("Demo moves to Friday at 4.");
    await expect(page2.getByTestId("team-speaker-name").filter({ hasText: "Priya Sharma" }).last()).toBeVisible();
    await page2.close();
  });
});

/** Comments on each planted line of the modal exercise and finishes with "request changes". */
async function reviewModal(page: Page, lines: number[]) {
  await page.getByTestId("tab-files").click();
  for (const n of lines) {
    await page.getByTestId(`comment-line-${n}`).click();
    await page.getByTestId("comment-form").locator("textarea").fill(`Line ${n} has a problem.`);
    await page.getByTestId("add-comment").click();
  }
  await expect(page.getByTestId("pending-comment")).toHaveCount(lines.length);
  await page.getByTestId("review-changes").click();
  await page.getByTestId("verdict-request_changes").click();
  await page.getByTestId("submit-review").click();
}

test.describe("review lab", () => {
  test("practice a pull request, see what was found and missed, and earn Bug hunter (RL1, RL4, BG1)", async ({ page }) => {
    await signIn(page, "asha-dev");
    await page.goto("/review-lab");
    await expect(page.getByRole("heading", { name: /Practice code review/ })).toBeVisible();
    await page.getByTestId("lab-modal-a11y").click();
    await expect(page.getByRole("heading", { name: /Add a reusable Modal component/ })).toBeVisible();

    // Submitting with no comments is refused before it reaches the server.
    await page.getByTestId("tab-files").click();
    await page.getByTestId("review-changes").click();
    await page.getByTestId("submit-review").click();
    await expect(page.getByTestId("review-box").getByRole("alert")).toContainText("at least one comment");
    await page.keyboard.press("Escape");

    // Half the problems: not passed, the missed ones are revealed.
    await reviewModal(page, [10, 14]);
    await expect(page.getByTestId("lab-result")).toContainText("50%");
    await expect(page.getByTestId("lab-result")).toContainText("Not passed yet");
    await expect(page.getByTestId("issue-missed")).toHaveCount(2);
    await expect(page.getByTestId("issue-found")).toHaveCount(2);

    // Again, all of them.
    await page.getByTestId("lab-again").click();
    await reviewModal(page, [4, 10, 11, 14]);
    await expect(page.getByTestId("lab-result")).toContainText("100%");
    await expect(page.getByTestId("issue-missed")).toHaveCount(0);

    await page.goto("/review-lab");
    await expect(page.getByTestId("lab-modal-a11y")).toContainText("Best 100%");
    await page.goto("/workspace");
    await page.getByTestId("open-badges").click();
    await expect(page.getByTestId("badge-list").last()).toContainText("Bug hunter");
  });

  test("a code review task can be a practice pull request, finished by grading (RL6, RL9)", async ({ page, request }) => {
    const admin = await apiToken(request, "admin-demo");
    const asha = await apiToken(request, "asha-dev");
    const me = await api<{ enrollment: { id: string } }>(request, asha, "GET", "/v1/me");
    const task = await api<{ id: string }>(request, admin, "POST", `/v1/admin/enrollments/${me.enrollment.id}/tasks`, {
      type: "code_review",
      title: "Review the search box PR",
      brief: "Find what's wrong before it ships.",
      due_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      review_mode: "self",
      content: { resources: [], quiz: null, review_lab: { exercise: "search-debounce", pass_percent: 60 } },
    });
    await signIn(page, "asha-dev");
    await page.goto(`/workspace?task=${task.id}`);
    await expect(page.getByTestId("review-lab-card")).toBeVisible();
    // No "mark done": grading finishes it.
    await expect(page.getByTestId("move-done")).toHaveCount(0);
    await page.getByTestId("open-review-lab").click();
    await expect(page.getByTestId("lab-task-badge")).toContainText("3 tries left");
    await page.getByTestId("tab-files").click();
    await page.getByTestId("comment-line-14").click();
    await page.getByTestId("comment-form").locator("textarea").fill("The dependency array is empty.");
    await page.getByTestId("add-comment").click();
    await page.getByTestId("review-changes").click();
    await page.getByTestId("submit-review").click();
    await expect(page.getByTestId("lab-result")).toContainText("Not passed yet");
    await page.getByTestId("lab-again").click();
    await expect(page.getByTestId("lab-task-badge")).toContainText("2 tries left");
  });

  test("the pull request page fits a phone (RL10) @mobile", async ({ page }) => {
    await signIn(page, "asha-dev");
    await page.goto("/review-lab/users-pagination");
    await expect(page.getByRole("heading", { name: /Paginate and search/ })).toBeVisible();
    await expect(page.getByTestId("lab-file").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("portfolio", () => {
  test("a student turns on their public portfolio and anyone can open it (PF1, PF2, PF4)", async ({ page, browser }) => {
    const anon = await browser.newPage();
    await anon.goto("/p/asha-dev");
    await expect(anon.getByText("No public portfolio here")).toBeVisible();

    await signIn(page, "asha-dev");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByTestId("menu-portfolio").click();
    await expect(page.getByRole("heading", { name: "Your portfolio" })).toBeVisible();
    await page.getByTestId("portfolio-public").click();
    await page.getByTestId("portfolio-headline").fill("Frontend intern who ships accessible UI");
    await page.getByTestId("portfolio-save").click();
    await expect(page.getByTestId("portfolio-url")).toContainText("/p/asha-dev");

    await anon.reload();
    await expect(anon.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
    await expect(anon.getByText("Frontend intern who ships accessible UI")).toBeVisible();
    await expect(anon.getByText("Tasks finished")).toBeVisible();

    // Someone who never turned it on has nothing to show.
    await anon.goto("/p/ravi-dev");
    await expect(anon.getByText("No public portfolio here")).toBeVisible();

    // Turning it off hides it again.
    await page.getByTestId("portfolio-public").click();
    await page.getByTestId("portfolio-save").click();
    await anon.goto("/p/asha-dev");
    await expect(anon.getByText("No public portfolio here")).toBeVisible();
    await anon.close();
  });
});
