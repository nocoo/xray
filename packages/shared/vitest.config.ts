import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		allowOnly: false,
		passWithNoTests: false,
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				// Barrel re-exports only
				"src/index.ts",
				// Type-only boundary / DTOs (no runtime)
				"src/dashboard.ts",
				"src/x-timeline-source.ts",
			],
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 85,
				statements: 90,
			},
		},
	},
});
