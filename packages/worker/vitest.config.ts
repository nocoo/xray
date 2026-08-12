import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			// Full non-View production surface (OBJECTIVE / 6DQ L1).
			// Only test helpers excluded — not domain routes/repos.
			include: [
				"src/lib/**/*.ts",
				"src/middleware/**/*.ts",
				"src/repos/**/*.ts",
				"src/routes/**/*.ts",
			],
			exclude: [
				"src/**/*.test.ts",
				"src/test/**",
				// Pure re-export of @xray/shared (zero local statements)
				"src/lib/handle.ts",
			],
			reporter: ["text", "json-summary"],
			// Floors: lines/funcs/stmts 95; branches 94 (media-proxy/zheto edge branches ~94.9%).
			// scripts/check-coverage.sh uses BRANCHES_MIN=94 for @xray/worker.
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 94,
				statements: 95,
			},
		},
	},
});
