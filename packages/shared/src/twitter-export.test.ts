import { describe, expect, test } from "vitest";
import {
	handleFromUserLink,
	parseMemberImportText,
	parseTwitterExportFile,
} from "./twitter-export.js";

describe("parseMemberImportText", () => {
	test("parses following.js with accountIds", () => {
		const content = `window.YTD.following.part0 = [ { "following" : { "accountId" : "123", "userLink" : "https://twitter.com/intent/user?user_id=123" } }, { "following" : { "accountId" : "456" } } ];`;
		const r = parseMemberImportText(content);
		expect(r).not.toBeNull();
		if (!r) return;
		expect(r.map((x) => x.externalAuthorId)).toEqual(["123", "456"]);
		expect(r[0]?.handle).toBe("u123");
	});

	test("parses screen_name from userLink", () => {
		const content = `window.YTD.following.part0 = [{"following":{"accountId":"1","userLink":"https://twitter.com/intent/user?user_id=1&screen_name=Jack"}}];`;
		const r = parseMemberImportText(content);
		expect(r?.[0]?.handle.toLowerCase()).toBe("jack");
		expect(r?.[0]?.externalAuthorId).toBe("1");
	});

	test("parses newline handle list", () => {
		const r = parseMemberImportText("@Alice\nbob\nhttps://x.com/carol\n");
		expect(r?.map((x) => x.handle.toLowerCase())).toEqual(["alice", "bob", "carol"]);
	});

	test("empty → null", () => {
		expect(parseMemberImportText("")).toBeNull();
		expect(parseMemberImportText("   ")).toBeNull();
	});
});

describe("handleFromUserLink", () => {
	test("path username", () => {
		expect(handleFromUserLink("https://x.com/elonmusk")).toBe("elonmusk");
	});
});

describe("parseTwitterExportFile legacy", () => {
	test("returns account ids", () => {
		const content = `window.YTD.follower.part0 = [{"follower":{"accountId":"999"}}];`;
		expect(parseTwitterExportFile(content)).toEqual(["999"]);
	});
});
