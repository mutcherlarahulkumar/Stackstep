import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the real web app against the real Go API and Postgres. CI starts both servers
 * (see .github/workflows/e2e.yml); locally, start them and run `pnpm test`.
 * SEED_CMD resets the database to the seed before the run.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1, // tests share one seeded database
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
