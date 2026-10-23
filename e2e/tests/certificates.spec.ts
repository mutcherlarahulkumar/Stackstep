import { expect, test } from "@playwright/test";

import { expectToast, signIn } from "./helpers";

test("certificates: issued by hand, verified publicly without signing in, revoked with a reason (CE1–CE4)", async ({ browser }) => {
  // The student sees how far they are and who issues the certificate.
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(student, "meera-dev");
  await student.getByTestId("open-progress").click();
  const details = student.getByTestId("progress-details");
  await expect(details).toContainText("Tasks finished");
  await expect(details.getByTestId("no-certificate")).toContainText("issues the certificate");
  await student.keyboard.press("Escape");

  // The admin issues it; below the bar they are warned but may still issue.
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(admin, "admin-demo");
  await admin.getByLabel("Search students").fill("meera");
  await admin.getByTestId("student-meera-dev").click();
  const panel = admin.getByTestId("certificate-panel");
  await panel.getByTestId("open-issue").click();
  const issue = admin.getByRole("dialog");
  await expect(issue.getByRole("heading", { name: /Issue a certificate to/ })).toBeVisible();
  await issue.getByTestId("confirm-issue").click();
  await expectToast(admin, /Certificate .* issued/);
  const codeButton = panel.getByTestId("view-certificate");
  await expect(codeButton).toHaveText(/[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}/);
  const shown = (await codeButton.innerText()).trim();

  // Anyone can verify it, typing it in lower case with dashes.
  const visitor = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await visitor.goto("/verify");
  await visitor.getByLabel("Certificate code").fill("not-a-code");
  await visitor.getByRole("button", { name: "Check" }).click();
  await expect(visitor.getByText("Codes are 12 letters and digits")).toBeVisible();
  await visitor.getByLabel("Certificate code").fill(shown.toLowerCase());
  await visitor.getByRole("button", { name: "Check" }).click();
  await expect(visitor.getByTestId("certificate-valid")).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Meera", exact: false })).toBeVisible();
  await visitor.getByRole("link", { name: "View certificate" }).click();
  await expect(visitor.getByTestId("certificate-document")).toContainText("Certificate of completion");
  await expect(visitor.getByTestId("certificate-document")).toContainText(shown);

  // The student gets the code in their progress panel.
  await student.reload();
  await student.getByTestId("open-progress").click();
  await expect(student.getByTestId("progress-details")).toContainText(shown);

  // Revoking needs a reason, which the public page then shows.
  await panel.getByTestId("open-revoke").click();
  const revoke = admin.getByRole("dialog");
  await revoke.getByTestId("confirm-revoke").click();
  await expect(revoke.getByText("Say why it's being revoked.")).toBeVisible();
  await revoke.getByLabel("Reason (shown publicly)").fill("Issued to the wrong student by mistake");
  await revoke.getByTestId("confirm-revoke").click();
  await expectToast(admin, "Certificate revoked");
  await expect(panel.getByTestId("open-issue")).toBeVisible();

  await visitor.goto(`/verify/${shown}`);
  await expect(visitor.getByTestId("certificate-revoked")).toContainText("Issued to the wrong student by mistake");

  // Unknown codes say so.
  await visitor.goto("/verify/ABCDEFGHJK23");
  await expect(visitor.getByText("No certificate with this code")).toBeVisible();
});
