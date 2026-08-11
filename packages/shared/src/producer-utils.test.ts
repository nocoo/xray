import { describe, expect, test } from "vitest";
import {
	assertAllowedBaseUrl,
	cacheFileBase,
	exitCodeForRefresh,
	isValidXHandle,
	parseMembersGraph,
	parsePushSuccessBody,
	pushRetryDelayMs,
	scrubEnvForTwitter,
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
	test("allows prod/staging ingest https and loopback", () => {
		expect(assertAllowedBaseUrl("https://xray-ingest.hexly.ai/", "ingest")).toBe(
			"https://xray-ingest.hexly.ai",
		);
		expect(assertAllowedBaseUrl("https://xray-ingest-staging.hexly.ai", "ingest")).toBe(
			"https://xray-ingest-staging.hexly.ai",
		);
		expect(assertAllowedBaseUrl("https://xray-staging.hexly.ai", "browser")).toBe(
			"https://xray-staging.hexly.ai",
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

describe("scrubEnvForTwitter", () => {
	test("strips push token and access cookie", () => {
		const out = scrubEnvForTwitter({
			PATH: "/bin",
			XRAY_PUSH_TOKEN: "secret",
			XRAY_CF_AUTHORIZATION: "jwt",
			XRAY_WINDOW_HOURS: "24",
			HOME: "/tmp",
		});
		expect(out.PATH).toBe("/bin");
		expect(out.XRAY_WINDOW_HOURS).toBe("24");
		expect(out.XRAY_PUSH_TOKEN).toBeUndefined();
		expect(out.XRAY_CF_AUTHORIZATION).toBeUndefined();
	});
});

describe("parseMembersGraph", () => {
	test("accepts valid snapshot", () => {
		const g = parseMembersGraph({
			watchlists: [
				{
					id: 1,
					name: "AI",
					members: [{ handle: "sama", sourceType: "x.com" }],
				},
			],
		});
		expect(g.watchlists[0]?.members[0]?.handle).toBe("sama");
	});

	test("rejects missing handle / bad id / wrong source", () => {
		expect(() =>
			parseMembersGraph({
				watchlists: [{ id: 1, name: "x", members: [{ sourceType: "x.com" }] }],
			}),
		).toThrow(/handle/);
		expect(() =>
			parseMembersGraph({
				watchlists: [{ id: 0, name: "x", members: [{ handle: "a", sourceType: "x.com" }] }],
			}),
		).toThrow(/id/);
		expect(() =>
			parseMembersGraph({
				watchlists: [
					{
						id: 1,
						name: "x",
						members: [{ handle: "a", sourceType: "custom" }],
					},
				],
			}),
		).toThrow(/sourceType/);
	});
});

describe("exitCodeForRefresh", () => {
	test("non-zero on rejected items or handle errors", () => {
		expect(
			exitCodeForRefresh({
				handleErrors: 0,
				pushErrors: 0,
				totalRejected: 0,
				handlesPlanned: 2,
				handlesOk: 2,
				fatalPush: false,
			}),
		).toBe(0);
		expect(
			exitCodeForRefresh({
				handleErrors: 0,
				pushErrors: 0,
				totalRejected: 1,
				handlesPlanned: 2,
				handlesOk: 2,
				fatalPush: false,
			}),
		).toBe(1);
		expect(
			exitCodeForRefresh({
				handleErrors: 1,
				pushErrors: 0,
				totalRejected: 0,
				handlesPlanned: 2,
				handlesOk: 1,
				fatalPush: false,
			}),
		).toBe(1);
	});
});
