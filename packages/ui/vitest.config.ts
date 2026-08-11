import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "happy-dom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		coverage: {
			provider: "v8",
			// View shells + presentational components exempt (L3). Non-View units gated.
			// View shells + thin API clients exempt from L1 denom (API exercised by L2 HTTP).
			// API module unit tests still run (client.test / modules.test).
			include: ["src/viewmodels/**/*.ts", "src/lib/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.test.tsx",
				"src/viewmodels/use-vm.ts",
				"src/lib/mock-data.ts",
				"src/lib/tweet-types.ts",
				"src/lib/version.ts",
				"src/lib/watchlist-icons.ts",
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
