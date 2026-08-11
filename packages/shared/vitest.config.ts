import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			/**
			 * Domain + export parsers. CLI process adapters excluded (operator scripts;
			 * covered by producer-* unit tests + refresh script entry tests).
			 */
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/index.ts",
				"src/x-timeline-source.ts",
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
				branches: 90,
				statements: 95,
			},
		},
	},
});
