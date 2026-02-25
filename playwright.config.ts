import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 17028;

export default defineConfig({
  testDir: "./e2e",
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
    command: `bun --bun next dev --port ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: "development",
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
