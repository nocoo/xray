import { describe, expect, test } from "vitest";
import { normalizeHandle } from "./handle.js";

describe("handle re-export", () => {
	test("normalizeHandle", () => {
		expect(normalizeHandle("@Alice")).toBe("alice");
		expect(normalizeHandle("Bob")).toBe("bob");
	});
});
