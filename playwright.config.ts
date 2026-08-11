import { defineConfig } from "@playwright/test";

/**
 * L3 — main user flows on isolated local data (docs/06).
 * Defaults: UI :7007, worker :8787 (AUTH_DEV_BYPASS). Never points at prod D1.
 * Override: PLAYWRIGHT_BROWSER_URL / PLAYWRIGHT_WORKER_URL / PLAYWRIGHT_INGEST_URL.
 * Optional L3-only worker: port 28787 + persist .wrangler/state-l3 (docs/02).
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
