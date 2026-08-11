import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 60_000,
		hookTimeout: 120_000,
		globalSetup: ["./test/e2e/global-setup.ts"],
		fileParallelism: false,
	},
});
