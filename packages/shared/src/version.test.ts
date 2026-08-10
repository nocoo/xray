import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { XRAY_VERSION } from "./version.js";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, "../../..");

describe("XRAY_VERSION", () => {
	test("matches all workspace package.json versions", () => {
		const paths = [
			join(rootDir, "package.json"),
			join(rootDir, "packages/shared/package.json"),
			join(rootDir, "packages/ui/package.json"),
			join(rootDir, "packages/worker/package.json"),
		];
		const versions = paths.map((path) => {
			const pkg = JSON.parse(readFileSync(path, "utf8")) as { version: string };
			return pkg.version;
		});
		for (const v of versions) {
			expect(v).toBe(XRAY_VERSION);
		}
		expect(XRAY_VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});
});
