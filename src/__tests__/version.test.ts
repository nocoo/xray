import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { readFileSync } from "fs";
import { APP_VERSION } from "@/lib/version";

// Read package.json independently to cross-check
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("version", () => {
  test("APP_VERSION matches package.json version", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  test("APP_VERSION is a valid semver string", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("APP_VERSION is non-empty", () => {
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });
});
