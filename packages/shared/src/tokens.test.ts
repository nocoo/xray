import { describe, expect, test } from "vitest";
import { parseTokenLabel, TOKEN_LABEL_MAX } from "./tokens.js";

describe("parseTokenLabel", () => {
	test("trims a valid 1..64 name", () => {
		expect(parseTokenLabel({ label: "  Producer  " })).toEqual({ ok: true, label: "Producer" });
		expect(parseTokenLabel({ label: "a" }).ok).toBe(true);
		expect(parseTokenLabel({ label: "a".repeat(TOKEN_LABEL_MAX) })).toEqual({
			ok: true,
			label: "a".repeat(TOKEN_LABEL_MAX),
		});
	});

	test("rejects invalid bodies without truncating", () => {
		expect(parseTokenLabel(null).ok).toBe(false);
		expect(parseTokenLabel("x")).toEqual({ ok: false, error: "invalid body" });
		expect(parseTokenLabel([])).toEqual({ ok: false, error: "invalid body" });
		expect(parseTokenLabel({})).toEqual({ ok: false, error: "label required" });
		expect(parseTokenLabel({ label: 1 })).toEqual({ ok: false, error: "label required" });
		expect(parseTokenLabel({ label: "   " })).toEqual({ ok: false, error: "label required" });
		const tooLong = `  ${"b".repeat(TOKEN_LABEL_MAX + 1)}  `;
		expect(parseTokenLabel({ label: tooLong })).toEqual({ ok: false, error: "label too long" });
		expect(tooLong.trim().length).toBe(TOKEN_LABEL_MAX + 1);
	});
});
