import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 27028;

// Use a production build under CI (or when E2E_PROD=1) to avoid vinext dev's
// on-demand compilation + hydration race that flakes locator interactions on
// slow runners — symptoms were "button disabled / locator timeout" because
// Playwright's fill()/click() reached the DOM before React hydrated. Local
// dev keeps the fast `vinext dev` loop for iteration speed.
const useProdServer = !!process.env.CI || process.env.E2E_PROD === "1";
const webServerCommand = useProdServer
  ? `bunx vinext build && bunx vinext start --port ${E2E_PORT}`
  : `bunx vinext dev --port ${E2E_PORT}`;
const webServerTimeout = useProdServer ? 180_000 : 60_000;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.pw.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: webServerCommand,
    port: E2E_PORT,
    reuseExistingServer: !useProdServer,
    timeout: webServerTimeout,
    env: {
      NODE_ENV: useProdServer ? "production" : "development",
      XRAY_DB: "database/xray.playwright.db",
      E2E_SKIP_AUTH: "true",
      MOCK_PROVIDER: "true",
      NEXTAUTH_SECRET: "e2e-test-secret",
      NEXTAUTH_URL: `http://localhost:${E2E_PORT}`,
      GOOGLE_CLIENT_ID: "e2e-test-client-id",
      GOOGLE_CLIENT_SECRET: "e2e-test-client-secret",
      ALLOWED_EMAILS: "e2e@test.com",
    },
  },
});
