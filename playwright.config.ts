import { defineConfig } from "@playwright/test";

/**
 * L3 smoke — dual-host happy path (docs/06).
 * Files must be `*.pw.ts` so Bun/vitest unit discovery does not load them.
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "*.pw.ts",
	timeout: 60_000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: {
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
