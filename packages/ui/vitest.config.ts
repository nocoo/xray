import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "./src"),
		},
	},
	test: {
		environment: "happy-dom",
		allowOnly: false,
		passWithNoTests: false,
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		coverage: {
			provider: "v8",
			// Non-View only: VMs, pure lib, API clients, hooks. Views/components = View shells.
			include: [
				"src/viewmodels/**/*.ts",
				"src/lib/**/*.ts",
				"src/api/**/*.ts",
				"src/hooks/**/*.ts",
			],
			exclude: [
				// Local dev/E2E server helper
				"dev/**",
				"src/**/*.test.ts",
				"src/**/*.test.tsx",
				// React binder (useSyncExternalStore glue)
				"src/viewmodels/use-vm.ts",
				// Types / static mock fixtures (not executable product logic)
				"src/lib/content-types.ts",
				"src/lib/tweet-types.ts",
				"src/lib/version.ts",
				"src/lib/watchlist-icons.ts",
				// React context shells
				"src/hooks/me-context.tsx",
				"src/hooks/use-mobile.tsx",
				"src/hooks/use-columns.ts",
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
