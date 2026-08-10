import { describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret, parseKek } from "./secrets-crypto.js";

const KEK_RAW = "0123456789abcdef0123456789abcdef"; // 32 chars

describe("secrets-crypto", () => {
	test("round-trips with AAD", async () => {
		const kek = parseKek(KEK_RAW, 1);
		const blob = await encryptSecret("sk-test", kek, "u1:ai.api_key");
		expect(blob[0]).toBe(1);
		const { plaintext, keyVersion } = await decryptSecret(blob, [kek], "u1:ai.api_key");
		expect(plaintext).toBe("sk-test");
		expect(keyVersion).toBe(1);
	});

	test("rejects wrong AAD", async () => {
		const kek = parseKek(KEK_RAW, 1);
		const blob = await encryptSecret("sk-test", kek, "u1:ai.api_key");
		await expect(decryptSecret(blob, [kek], "u2:ai.api_key")).rejects.toBeTruthy();
	});

	test("parseKek requires 32 bytes", () => {
		expect(() => parseKek("short", 1)).toThrow();
		expect(() => parseKek("a".repeat(16), 1)).toThrow();
	});
});

import { maskSecret, resolveKeks } from "./secrets-crypto.js";

describe("resolveKeks", () => {
	test("includes prev when set", () => {
		const list = resolveKeks({
			XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
			XRAY_SECRETS_KEK_PREV: "fedcba9876543210fedcba9876543210",
			XRAY_SECRETS_KEY_VERSION: "2",
		});
		expect(list.length).toBe(2);
		expect(list[0]?.version).toBe(2);
		expect(maskSecret(true)).toContain("•");
		expect(maskSecret(false)).toBe("");
	});
});
