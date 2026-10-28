import { expect, test, type Page } from "@playwright/test";

import { expectToast, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

// A real PNG header (the API sniffs the bytes); the trailing byte makes each screenshot distinct.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const screenshot = (n: number) => ({ name: `payment-${n}.png`, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from([n])]) });

async function sendProof(page: Page, n: number, utr: string, amount: string | null) {
  await page.locator('input[type="file"]').setInputFiles(screenshot(n));
  await expect(page.getByTestId("proof-preview")).toBeVisible();
  await page.getByTestId("apply-utr").fill(utr);
  if (amount !== null) await page.getByTestId("apply-paid").fill(amount);
}

test("apply and pay: details, QR, partial payment flagged, balance paid, approved into the workspace (AP1, AP2, AP4–AP7)", async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "neha-dev");

  // AP1: no internship → the application, never an old cohort's chats.
  await expect(student.getByRole("heading", { name: "Join an internship cohort" })).toBeVisible();
  await expect(student.getByRole("navigation", { name: "Chats" })).toHaveCount(0);
  await expect(student.getByTestId("apply-step-1")).toHaveAttribute("data-state", "current");

  // AP2: the form checks every field before sending.
  await student.getByTestId("apply-save").click();
  await expect(student.getByText("Enter your college.")).toBeVisible();
  await expect(student.getByText("Enter a phone number with 10 to 15 digits.")).toBeVisible();
  await student.getByTestId("apply-cohort-Frontend Cohort · Open").click();
  await student.getByTestId("apply-phone").fill("+91 98765 43210");
  await student.getByTestId("apply-date_of_birth").fill("2004-05-17");
  await student.getByTestId("apply-grad_year").fill("2027");
  await student.getByTestId("apply-college").fill("ANITS");
  await student.getByTestId("apply-course").fill("B.Tech");
  await student.getByTestId("apply-branch").fill("Computer Science");
  await student.getByTestId("apply-save").click();

  // Step 2: QR, UPI ID, fee and the no-refund policy.
  await expect(student.getByTestId("apply-step-2")).toHaveAttribute("data-state", "current");
  await expect(student.getByTestId("apply-amount")).toHaveText("₹4,999");
  await expect(student.getByTestId("payment-upi")).toContainText("stackstep@okaxis");
  await expect(student.getByTestId("payment-qr")).toBeVisible();
  await expect(student.getByTestId("no-refund")).toContainText("non-refundable under any circumstances");

  // AP4: the refund policy must be ticked; then the proof goes for review.
  await sendProof(student, 1, "UTR123456789", "2000");
  await student.getByTestId("apply-send-proof").click();
  await expect(student.getByText("Please confirm you've read the refund policy.")).toBeVisible();
  await student.getByTestId("apply-agree").click();
  await student.getByTestId("apply-send-proof").click();
  await expect(student.getByTestId("apply-waiting")).toContainText("Payment received — awaiting confirmation");
  await expect(student.getByTestId("proof-row")).toHaveCount(1);
  await student.getByTestId("application-chat-input").fill("I paid 2000 now, rest tomorrow.");
  await student.getByTestId("application-chat-send").click();
  await expect(student.getByTestId("application-message").filter({ hasText: "rest tomorrow" })).toBeVisible();

  // AP5: the admin sees it in Applications, with the screenshot and the chat.
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: /Applications/ }).click();
  await admin.getByTestId("application-row-neha-dev").click();
  const detail = admin.getByTestId("application-detail");
  await expect(detail.getByRole("heading", { name: "Neha Singh" })).toBeVisible();
  await expect(detail.getByTestId("application-message").filter({ hasText: "rest tomorrow" })).toBeVisible();
  await detail.getByTestId("proof-row").getByRole("button", { name: "View" }).click();
  await expect(admin.getByTestId("proof-image")).toBeVisible();
  await admin.keyboard.press("Escape");

  // AP6: approving short of the fee is stopped; flag it as a partial payment instead.
  await detail.getByTestId("decide-approve").click();
  let dialog = admin.getByRole("dialog");
  await expect(dialog.getByTestId("decide-paid")).toHaveValue("2000");
  await dialog.getByTestId("decide-submit").click();
  await expect(dialog.getByText(/short of the ₹4,999 fee/)).toBeVisible();
  await dialog.getByTestId("decide-mode-flag").click();
  await expect(dialog.getByTestId("decide-flag-reason")).toContainText("Partial payment");
  await dialog.getByTestId("decide-submit").click();
  await expectToast(admin, "Flagged — the student was told what to do");
  await detail.getByTestId("application-chat-input").fill("Got ₹2,000. Pay the rest whenever you're ready.");
  await detail.getByTestId("application-chat-send").click();

  // The student sees what's wrong and pays the balance from the QR again.
  await student.reload();
  await expect(student.getByTestId("apply-flagged")).toContainText("We received ₹2,000 of ₹4,999. Pay the remaining ₹2,999.");
  await expect(student.getByTestId("application-message").filter({ hasText: "Pay the rest whenever" })).toBeVisible();
  await student.getByTestId("apply-action-pay").click();
  await expect(student.getByTestId("apply-amount")).toHaveText("₹2,999");
  await sendProof(student, 2, "UTR987654321", null);
  await expect(student.getByTestId("apply-paid")).toHaveValue("2999");
  await student.getByTestId("apply-agree").click();
  await student.getByTestId("apply-send-proof").click();
  await expect(student.getByTestId("apply-waiting")).toBeVisible();

  // AP7: approve the full amount → enrolled; the workspace opens.
  await admin.reload();
  await admin.getByTestId("application-row-neha-dev").click();
  await expect(detail.getByTestId("proof-row")).toHaveCount(2);
  await detail.getByTestId("decide-approve").click();
  dialog = admin.getByRole("dialog");
  await expect(dialog.getByTestId("decide-paid")).toHaveValue("4999");
  await dialog.getByTestId("decide-submit").click();
  await expectToast(admin, "Neha Singh is enrolled");

  // The open page notices on its next check and offers the workspace; a reload goes straight in.
  await expect(student.getByTestId("apply-approved")).toBeVisible({ timeout: 20_000 });
  await student.getByTestId("apply-open-workspace").click();
  await expect(student.getByRole("navigation", { name: "Chats" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "Join an internship cohort" })).toHaveCount(0);
});
