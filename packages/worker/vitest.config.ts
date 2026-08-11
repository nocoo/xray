import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			/**
			 * L1 denominator (non-View production helpers).
			 * Excluded with separate gates / rationale:
			 * - routes/** → L2 real-HTTP + gate:routes (100% method+path)
			 * - repos/** → exercised via L2 D1 + unit *.test.ts (not in % gate)
			 * - access-auth.ts → JWT/JWKS bootstrap (unit tests exist; gecko-style auth exclude)
			 * - ai-endpoint.ts → SSRF host matrix (unit tests exist)
			 * - handle.ts → pure re-export of @xray/shared
			 */
			include: ["src/lib/**/*.ts", "src/middleware/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/test/**",
				"src/lib/handle.ts",
				"src/lib/ai-endpoint.ts",
				"src/middleware/access-auth.ts",
			],
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 89,
				statements: 95,
			},
		},
	},
});
