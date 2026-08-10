import { describe, expect, test } from "vitest";
import { normalizeHandle } from "./handle.js";

describe("normalizeHandle", () => {
	test("strips at and lowercases", () => {
		expect(normalizeHandle("  @KarPathy ")).toBe("karpathy");
		expect(normalizeHandle("Hermes-Agent")).toBe("hermes-agent");
	});
});
