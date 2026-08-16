import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Structural guard: the operator entry must import symbols it calls,
 * and must not bypass the XTimelineSource boundary into vendor APIs.
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

	test("uses XTimelineSource adapter, not vendor map/CLI calls", () => {
		expect(src).toMatch(/\bcreateTwitterCliSource\b/);
		expect(src).toMatch(/\bXTimelineSource\b/);
		expect(src).toMatch(/\bbuildIngestBatches\b/);
		// Boundary: orchestrator must not call vendor mapper or CLI helpers directly
		expect(src).not.toMatch(/\bmapTwitterCliEnvelope\b/);
		expect(src).not.toMatch(/\btwitterUserPosts\b/);
		expect(src).not.toMatch(/\btwitterStatus\b/);
	});

	test("live ingest graph at start; no browser/cookie graph path", () => {
		expect(src).toMatch(/\bfetchIngestGraph\b/);
		expect(src).toMatch(/\bapplyExplicitMembersFile\b/);
		expect(src).toMatch(/\bresolveIngestBase\b/);
		expect(src).not.toMatch(/XRAY_BROWSER_BASE/);
		expect(src).not.toMatch(/XRAY_CF_AUTHORIZATION/);
		expect(src).not.toMatch(/XRAY_MEMBERS_FILE/);
		expect(src).not.toMatch(/config\/members\.json/);
	});
});
