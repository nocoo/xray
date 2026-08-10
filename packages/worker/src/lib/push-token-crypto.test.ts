import { describe, expect, test } from "vitest";
import { mintPushToken, sha256Hex, timingSafeEqual } from "./push-token-crypto.js";

describe("push token crypto", () => {
	test("mints xray_pt_ format and hashes", async () => {
		const t = await mintPushToken();
		expect(t.plaintext.startsWith("xray_pt_")).toBe(true);
		expect(t.tokenPrefix).toHaveLength(8);
		expect(t.tokenHash).toHaveLength(64);
		expect(await sha256Hex(t.plaintext)).toBe(t.tokenHash);
	});

	test("timingSafeEqual", () => {
		expect(timingSafeEqual("abc", "abc")).toBe(true);
		expect(timingSafeEqual("abc", "abd")).toBe(false);
		expect(timingSafeEqual("ab", "abc")).toBe(false);
	});
});
