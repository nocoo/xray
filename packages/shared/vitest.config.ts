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
				// Type-only boundary (no runtime)
				"src/x-timeline-source.ts",
			],
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
	},
});
