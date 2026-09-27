import { defineConfig } from "@playwright/test";

if (process.env.XRAY_E2E_MANAGED !== "1") throw new Error("Start the managed stack with bun run test:l3");
export default defineConfig({
	testDir: "./e2e",
	testMatch: "*.pw.ts",
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
