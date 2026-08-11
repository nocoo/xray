import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Structural guard: the operator entry must import symbols it calls.
 * Catches the regression where pushIngestBatch was used without import.
 */
describe("scripts/refresh-watchlists.ts entry wiring", () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
	const src = readFileSync(join(root, "scripts/refresh-watchlists.ts"), "utf8");

	test("imports and calls pushIngestBatch from @xray/shared", () => {
		expect(src).toMatch(
			/import\s*\{[\s\S]*\bpushIngestBatch\b[\s\S]*\}\s*from\s*["'][^"']*index\.ts["']/,
		);
		expect(src).toMatch(/\bpushIngestBatch\s*\(/);
	});

	test("imports mapTwitterCliEnvelope and buildIngestBatches", () => {
		expect(src).toMatch(/\bmapTwitterCliEnvelope\b/);
		expect(src).toMatch(/\bbuildIngestBatches\b/);
	});
});
