import { expect, test } from "@playwright/test";

import { expectToast, signIn, unique } from "./helpers";

test("quiz: admin writes it, the student retries and passes, the answer key shows after (Q1–Q4)", async ({ browser }) => {
  const title = unique("Git basics check");
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByTestId("student-asha-dev").click();
  await admin.getByTestId("open-assign").click();

  await admin.getByLabel("Type", { exact: true }).click();
  await admin.getByRole("option", { name: "Quiz" }).click();
  await admin.getByLabel("Title").fill(title);
  await admin.getByTestId("assign-submit").click();
  await expect(admin.getByText("Write the question (at least 3 characters).")).toBeVisible();

  await admin.getByLabel("Question 1", { exact: true }).fill("What does git add do?");
  await admin.getByLabel("Question 1 option 1").fill("Creates a commit");
  await admin.getByLabel("Question 1 option 2").fill("Stages changes");
  await admin.getByRole("radiogroup", { name: "Right answer for question 1" }).getByLabel("Option 2 is right").check();
  await admin.getByRole("button", { name: "Add link" }).click();
  await admin.getByLabel("Link 1 name").fill("Pro Git: Recording changes");
  await admin.getByLabel("Link 1 address").fill("https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository");
  await admin.getByRole("radio", { name: "In 2 hours" }).click();
  await admin.getByTestId("assign-submit").click();
  await expectToast(admin, `Assigned “${title}”`);

  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "asha-dev");
  const board = student.getByRole("region", { name: "Task board" });
  await board.getByRole("button", { name: title }).click();
  await expect(student.getByRole("link", { name: /Pro Git: Recording changes/ })).toHaveAttribute("rel", /noopener/);
  const quiz = student.getByRole("region", { name: "Quiz" });
  await expect(quiz.getByLabel("Right answer")).toHaveCount(0); // no key before finishing

  await quiz.getByLabel("Creates a commit").check();
  await student.getByTestId("quiz-submit").click();
  await expectToast(student, /not quite/);
  await expect(student.getByTestId("quiz-stats")).toContainText("2 attempts left");

  await quiz.getByLabel("Stages changes").check();
  await student.getByTestId("quiz-submit").click();
  await expectToast(student, "Passed with 100%");
  await expect(quiz.getByLabel("Right answer")).toHaveCount(1);
  await expect(student.getByTestId("quiz-stats")).toContainText("finished");

  await admin.reload();
  await admin.getByTestId("student-asha-dev").click();
  await expect(admin.getByTestId(`task-row-${title}`)).toContainText("Done");
  await expect(admin.getByTestId(`task-row-${title}`).getByTestId("quiz-score")).toHaveText("Quiz 100%");
});
