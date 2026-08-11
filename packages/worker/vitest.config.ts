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
			// Floors enforced by scripts/check-coverage.sh CLI args; keep in sync at 95.
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 95,
				statements: 95,
			},
		},
	},
});
