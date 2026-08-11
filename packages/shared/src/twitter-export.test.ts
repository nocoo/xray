import { describe, expect, test } from "vitest";
import {
	accountIdString,
	handleFromUserLink,
	isValidXHandle,
	MEMBER_IMPORT_MAX_CHARS,
	parseMemberImportText,
	parseTwitterExportFile,
} from "./twitter-export.js";

describe("parseMemberImportText", () => {
	test("skips accountId-only archive rows without screen_name", () => {
		const content = `window.YTD.following.part0 = [ { "following" : { "accountId" : "123", "userLink" : "https://twitter.com/intent/user?user_id=123" } }, { "following" : { "accountId" : "456" } } ];`;
		const r = parseMemberImportText(content);
		// no screen_name / path handle → null or empty → null
		expect(r).toBeNull();
	});

	test("parses screen_name from userLink", () => {
		const content = `window.YTD.following.part0 = [{"following":{"accountId":"1","userLink":"https://twitter.com/intent/user?user_id=1&screen_name=Jack"}}];`;
		const r = parseMemberImportText(content);
		expect(r?.[0]?.handle.toLowerCase()).toBe("jack");
		expect(r?.[0]?.externalAuthorId).toBe("1");
	});

	test("parses path handle from userLink", () => {
		const content = `window.YTD.following.part0 = [{"following":{"accountId":"99","userLink":"https://x.com/elonmusk"}}];`;
		const r = parseMemberImportText(content);
		expect(r?.[0]?.handle).toBe("elonmusk");
		expect(r?.[0]?.externalAuthorId).toBe("99");
	});

	test("parses newline handle list", () => {
		const r = parseMemberImportText("@Alice\nbob\nhttps://x.com/carol\n");
		expect(r?.map((x) => x.handle.toLowerCase())).toEqual(["alice", "bob", "carol"]);
	});

	test("rejects pure snowflake id array (no handles)", () => {
		// large snowflake as JSON number would lose precision; we no longer invent u{id} handles
		expect(parseMemberImportText("[1234567890123456789]")).toBeNull();
		expect(parseMemberImportText('["1234567890123456789"]')).toBeNull();
	});

	test("parses JSON objects with handle + accountId strings", () => {
		const r = parseMemberImportText(
			JSON.stringify([
				{ handle: "alice", accountId: "111" },
				{ screen_name: "bob", accountId: "222" },
			]),
		);
		expect(r?.map((x) => x.handle)).toEqual(["alice", "bob"]);
		expect(r?.[0]?.externalAuthorId).toBe("111");
	});

	test("empty → null", () => {
		expect(parseMemberImportText("")).toBeNull();
		expect(parseMemberImportText("   ")).toBeNull();
	});

	test("throws when text too large", () => {
		expect(() => parseMemberImportText("a".repeat(MEMBER_IMPORT_MAX_CHARS + 1))).toThrow(/exceeds/);
	});

	test("throws when more than max seeds", () => {
		const handles = Array.from({ length: 501 }, (_, i) => `u${String(i).padStart(4, "0")}`).join(
			"\n",
		);
		expect(() => parseMemberImportText(handles)).toThrow(/max is 500/);
	});

	test("rejects invalid handle tokens", () => {
		expect(parseMemberImportText("not-valid-handle!!\ntoolonghandle12345")).toBeNull();
	});
});

describe("accountIdString", () => {
	test("accepts decimal string and safe integer", () => {
		expect(accountIdString("1234567890123456789")).toBe("1234567890123456789");
		expect(accountIdString(42)).toBe("42");
	});
	test("rejects unsafe number and garbage", () => {
		expect(accountIdString(Number.MAX_SAFE_INTEGER + 2)).toBeNull();
		expect(accountIdString("12ab")).toBeNull();
		expect(accountIdString(null)).toBeNull();
	});
});

describe("isValidXHandle", () => {
	test("15 char max", () => {
		expect(isValidXHandle("a".repeat(15))).toBe(true);
		expect(isValidXHandle("a".repeat(16))).toBe(false);
		expect(isValidXHandle("u1234567890123456789")).toBe(false);
	});
});

describe("handleFromUserLink", () => {
	test("path username", () => {
		expect(handleFromUserLink("https://x.com/elonmusk")).toBe("elonmusk");
	});
});

describe("parseTwitterExportFile legacy", () => {
	test("returns account ids when handles present", () => {
		const content = `window.YTD.follower.part0 = [{"follower":{"accountId":"999","userLink":"https://x.com/foo"}}];`;
		expect(parseTwitterExportFile(content)).toEqual(["999"]);
	});
	test("null when only account ids", () => {
		const content = `window.YTD.follower.part0 = [{"follower":{"accountId":"999"}}];`;
		expect(parseTwitterExportFile(content)).toBeNull();
	});
});
