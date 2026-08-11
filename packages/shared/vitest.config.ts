import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/index.ts",
				// Type-only boundary (no runtime exports)
				"src/x-timeline-source.ts",
				// CLI/process boundary — covered by script entry tests + operator runs
				"src/producer-spawn.ts",
				"src/producer-push.ts",
				"src/twitter-cli-source.ts",
				"src/twitter-cli-map.ts",
				"src/refresh-script-entry.ts",
			],
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 95,
				statements: 95,
			},
		},
	},
});
