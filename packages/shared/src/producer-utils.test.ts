import { describe, expect, test } from "vitest";
import {
	assertAllowedBaseUrl,
	cacheFileBase,
	isValidXHandle,
	parsePushSuccessBody,
	pushRetryDelayMs,
	shouldStopPush,
} from "./producer-utils.js";

describe("isValidXHandle / cacheFileBase", () => {
	test("accepts normal handles", () => {
		expect(isValidXHandle("sama")).toBe(true);
		expect(isValidXHandle("elon_musk")).toBe(true);
		expect(cacheFileBase("AndrewYNg")).toBe("andrewyng");
	});

	test("rejects path traversal and oversize", () => {
		expect(isValidXHandle("../etc")).toBe(false);
		expect(isValidXHandle("a/b")).toBe(false);
		expect(isValidXHandle("toolonghandlenamexx")).toBe(false);
		expect(() => cacheFileBase("../x")).toThrow(/invalid/);
	});
});

describe("assertAllowedBaseUrl", () => {
	test("allows prod ingest https and loopback", () => {
		expect(assertAllowedBaseUrl("https://xray-ingest.hexly.ai/", "ingest")).toBe(
			"https://xray-ingest.hexly.ai",
		);
		expect(assertAllowedBaseUrl("http://127.0.0.1:8787", "ingest")).toBe("http://127.0.0.1:8787");
	});

	test("rejects evil hosts and paths", () => {
		expect(() => assertAllowedBaseUrl("https://evil.example/x", "ingest")).toThrow();
		expect(() => assertAllowedBaseUrl("http://xray-ingest.hexly.ai", "ingest")).toThrow(/https/);
		expect(() => assertAllowedBaseUrl("https://user:pass@xray-ingest.hexly.ai", "ingest")).toThrow(
			/credentials/,
		);
		expect(() => assertAllowedBaseUrl("https://xray-ingest.hexly.ai/api", "ingest")).toThrow(
			/path/,
		);
	});
});

describe("parsePushSuccessBody", () => {
	test("accepts balanced counts", () => {
		const r = parsePushSuccessBody({ ok: true, accepted: 2, deduped: 1, rejected: 0 }, 3);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.accepted).toBe(2);
	});

	test("rejects missing ok or bad sum", () => {
		expect(parsePushSuccessBody({ accepted: 1 }, 1).ok).toBe(false);
		expect(parsePushSuccessBody({ ok: true, accepted: 1, deduped: 0, rejected: 0 }, 2).ok).toBe(
			false,
		);
	});
});

describe("push retry helpers", () => {
	test("stop on auth errors; delay on 429/5xx", () => {
		expect(shouldStopPush(401)).toBe(true);
		expect(shouldStopPush(500)).toBe(false);
		expect(pushRetryDelayMs(429, 1)).toBeGreaterThan(0);
		expect(pushRetryDelayMs(503, 1)).toBeGreaterThan(0);
		expect(pushRetryDelayMs(400, 1)).toBeNull();
	});
});
