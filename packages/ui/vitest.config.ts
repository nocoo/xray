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
			// Non-View units only (Views/components are thin shells — L3/Playwright)
			// ViewModels + pure lib (API thin clients exercised by L2 real-HTTP)
			include: [
				"src/viewmodels/**/*.ts",
				"src/lib/zheto-save.ts",
				"src/lib/utils.ts",
				"src/lib/tag-color.ts",
			],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.test.tsx",
				// React binder only — not in L1 denominator
				"src/viewmodels/use-vm.ts",
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
