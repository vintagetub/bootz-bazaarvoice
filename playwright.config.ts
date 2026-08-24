import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

/**
 * These tests run against a production build, because the behaviour under test
 * (the inline loader script, CSP response headers, redirects) is produced by
 * `next build` and does not exist in dev mode.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Escape hatch for environments that ship a pre-installed Chromium
        // whose build number does not match this @playwright/test version.
        // Unset everywhere else, so the managed browser is used as normal.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    /**
     * Builds as well as serves. The bv.js URL and the CSP are baked in at build
     * time, so serving a build made with different environment variables would
     * test something other than the config below.
     */
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      BV_CLIENT_NAME: "testclient",
      BV_SITE_ID: "main_site",
      BV_LOCALE: "en_US",
      BV_ENVIRONMENT: "staging",
      BRAND_NAME: "Bootz",
      BRAND_HOME_URL: "https://www.example.com",
    },
  },
});
