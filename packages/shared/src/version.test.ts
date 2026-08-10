import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { XRAY_VERSION } from "./version.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("XRAY_VERSION", () => {
	test("matches monorepo package.json versions", () => {
		const root = JSON.parse(readFileSync(join(here, "../../../package.json"), "utf8")) as {
			version: string;
		};
		const shared = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")) as {
			version: string;
		};
		expect(XRAY_VERSION).toBe(shared.version);
		expect(shared.version).toBe(root.version);
		expect(XRAY_VERSION).toMatch(/-dev\./);
	});
});
