import { devices, expect, test } from "@playwright/test";

const phone = (name: string) => {
  const d = devices[name];
  return {
    userAgent: d?.userAgent,
    viewport: d?.viewport,
    isMobile: d?.isMobile,
    hasTouch: d?.hasTouch,
  };
};

test("get the app on a desktop shows both phones and a QR code (DL2)", async ({
  page,
}) => {
  await page.goto("/download");
  const ctas = page.getByTestId("download-ctas");
  await expect(page.getByTestId("download-qr")).toBeVisible();
  await expect(ctas.getByTestId("download-android")).toHaveAttribute(
    "href",
    "/download/stackstep.apk",
  );
  await expect(ctas.getByTestId("download-ios")).toBeVisible();
  await expect(page.getByTestId("download-qr")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Android" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The tour's steps scroll past the phone.
  await page.getByTestId("tour-step-3").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("tour-step-3")).toHaveClass(/opacity-100/);
  // Troubleshooting answers open in place.
  const faq = page.getByTestId("download-faq");
  await faq.getByText("It says App not installed").click();
  await expect(faq.getByText(/Uninstall the old app/)).toBeVisible();
});

test.describe("on an Android phone", () => {
  test.use(phone("Pixel 7"));
  test("one tap downloads the APK, and the page fits the screen (DL3, DL5) @mobile", async ({
    page,
  }) => {
    await page.goto("/download");
    const ctas = page.getByTestId("download-ctas");
    // The buttons settle once the page knows the device.
    await expect(ctas.getByTestId("download-android")).toHaveCount(1);
    await expect(ctas.getByTestId("download-android")).toBeVisible();
    await expect(ctas.getByTestId("download-ios")).toHaveCount(0);
    await expect(page.getByTestId("download-qr")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Android" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  });
});

test.describe("on an iPhone", () => {
  test.use(phone("iPhone 14"));
  test("without an App Store link it shows how to add the web app (DL4) @mobile", async ({
    page,
  }) => {
    await page.goto("/download");
    await page.getByTestId("download-ios").click();
    await expect(page.getByRole("tab", { name: "iPhone" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByText("Add to Home Screen", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  });
});

test("the Android download is our own address and the page never names the code host (DL6)", async ({
  page,
  request,
}) => {
  const res = await request.get("/download/stackstep.apk", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toMatch(/stackstep\.apk$/);
  await page.goto("/download");
  await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
  await expect(page.getByText(/github release/i)).toHaveCount(0);
});
