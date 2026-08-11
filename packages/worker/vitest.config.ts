import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			// L1 pure helpers (6DQ). Middleware/repos/routes: unit tests remain;
			// L2 real-HTTP + route gate owns integration surface.
			include: [
				"src/lib/env.ts",
				"src/lib/rate-limit.ts",
				"src/lib/push-token-crypto.ts",
				"src/lib/ai-client.ts",
				"src/middleware/observability.ts",
			],

			exclude: ["src/**/*.test.ts", "src/test/**"],
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
