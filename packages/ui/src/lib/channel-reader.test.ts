import { describe, expect, test } from "vitest";
import {
	adjacentArticle,
	articlePath,
	ingestEndpoint,
	initialArticle,
	readerAction,
	readerStorageKey,
	readPosition,
	readPreferences,
	safeMarkdownUrl,
	writeReaderValue,
} from "./channel-reader";

describe("reader contracts", () => {
	test("scopes state by identity and data mode, preserves date in routes, chooses issuing environment", () => {
		expect(readerStorageKey("a:b", "mock")).toBe("xray:reader:a%3Ab:mock");
		expect(readerStorageKey("a:b", "mock")).not.toBe(readerStorageKey("a:b", "product"));
		expect(readerStorageKey("other", "mock")).not.toBe(readerStorageKey("a:b", "mock"));
		expect(articlePath(1, 2, "2026-09-22")).toBe("/channels/1/articles/2?date=2026-09-22");
		expect(articlePath(1, null, "")).toBe("/channels/1");
		expect(ingestEndpoint("mock")).toBe("http://localhost:37007/api/v1/ingest/articles");
		expect(ingestEndpoint("product")).toBe(
			"https://xray-ingest.worker.hexly.ai/api/v1/ingest/articles",
		);
	});
	test("allows only external HTTPS images and safe external links", () => {
		for (const url of [
			"http://x.test/a",
			"data:image/png;base64,abc",
			"javascript:alert(1)",
			"/relative",
			"//x.test/a",
			"https://u:p@x.test/a",
			"https://u@x.test/a",
			"https://:p@x.test/a",
		])
			expect(safeMarkdownUrl(url, true)).toBe("");
		expect(safeMarkdownUrl("https://x.test/a", true)).toBe("https://x.test/a");
		for (const url of ["https://x.test/", "http://x.test/", "mailto:a@x.test"])
			expect(safeMarkdownUrl(url, false)).toBe(url);
		expect(safeMarkdownUrl("file:///etc/passwd", false)).toBe("");
	});
	test("keyboard preserves native document arrows and ignores IME, modifiers and editing contexts", () => {
		const event = {
			key: "j",
			isComposing: false,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			shiftKey: false,
		};
		for (const [key, inList, result] of [
			["j", false, "next"],
			["k", false, "previous"],
			["ArrowDown", true, "next"],
			["ArrowUp", true, "previous"],
			["ArrowDown", false, null],
			["ArrowUp", false, null],
			["Enter", true, "read"],
			["Enter", false, null],
			["Escape", false, "list"],
			["x", true, null],
		] as const)
			expect(readerAction({ ...event, key }, false, inList)).toBe(result);
		expect(readerAction(event, true, true)).toBeNull();
		for (const flag of ["isComposing", "ctrlKey", "metaKey", "altKey", "shiftKey"])
			expect(readerAction({ ...event, [flag]: true }, false, true)).toBeNull();
		expect(adjacentArticle([3, 2, 1], 3, "next")).toBe(2);
		expect(adjacentArticle([3, 2, 1], 3, "previous")).toBe(3);
		expect(adjacentArticle([3, 2, 1], 1, "next")).toBe(1);
		expect(adjacentArticle([3], 99, "previous")).toBe(3);
		expect(adjacentArticle([], 99, "next")).toBeUndefined();
	});
	test("restores bounded preferences/positions and survives unavailable or corrupt storage", () => {
		const storage = { getItem: () => "600", setItem: (_key: string, _value: string) => {} };
		expect(readPosition(storage, "key")).toBe(600);
		for (const value of ["-1", "NaN", "Infinity", "", "0"])
			expect(readPosition({ getItem: () => value }, "key")).toBe(0);
		expect(readPreferences({ getItem: () => '{"sans":true,"size":22}' }, "key")).toEqual({
			sans: true,
			size: 22,
			fullWidth: false,
		});
		for (const value of [null, "null", "garbage", '{"size":100}'])
			expect(readPreferences({ getItem: () => value }, "key")).toEqual({
				sans: false,
				size: 18,
				fullWidth: false,
			});
		const denied = {
			getItem: () => {
				throw Error("denied");
			},
			setItem: () => {
				throw Error("denied");
			},
		};
		expect(readPosition(denied, "key")).toBe(0);
		expect(readPreferences(denied, "key")).toEqual({ sans: false, size: 18, fullWidth: false });
		expect(() => writeReaderValue(denied, "key", "600")).not.toThrow();
		writeReaderValue(storage, "key", "600");
	});
});

test("copy request uses an external report file and reports clipboard failure", async () => {
	const { channelRequest, copyChannelText, reportExample } = await import("./channel-reader");
	expect(channelRequest("mock", "xray_pt_test")).toContain("--data @report.json");
	expect(channelRequest("product", "xray_pt_test")).toContain("Authorization: Bearer xray_pt_test");
	expect(JSON.parse(reportExample)).toMatchObject({
		report_date: "2026-09-22",
		external_id: "daily-2026-09-22",
		markdown: "## Progress\n\nToday's findings.",
	});
	let copied = "";
	expect(
		await copyChannelText("key", {
			writeText: async (text) => {
				copied = text;
			},
		}),
	).toBe("Copied");
	expect(copied).toBe("key");
	expect(await copyChannelText("key", undefined)).toMatch(/Copy failed/);
	expect(
		await copyChannelText("key", {
			writeText: async () => {
				throw Error("denied");
			},
		}),
	).toMatch(/Copy failed/);
});

test("selects the first report only after the matching list loads without replacing deep links", () => {
	const list = {
		channelId: 1,
		date: "2026-09-22",
		loading: false,
		pageCount: 2,
		error: null,
		items: [{ id: 7 }, { id: 6 }],
	};
	expect(initialArticle(list, 1, 0, list.date)).toBe(7);
	expect(initialArticle(list, 1, 99, list.date)).toBeUndefined();
	expect(initialArticle(list, 0, 0, list.date)).toBeUndefined();
	expect(initialArticle(list, 2, 0, list.date)).toBeUndefined();
	expect(initialArticle(list, 1, 0, "2026-09-21")).toBeUndefined();
	for (const patch of [{ loading: true }, { pageCount: 0 }, { error: "Failed" }, { items: [] }]) {
		expect(initialArticle({ ...list, ...patch }, 1, 0, list.date)).toBeUndefined();
	}
});

test("persists full width alongside font preferences and rejects non-boolean width values", () => {
	let saved = "";
	const storage = {
		getItem: () => saved,
		setItem: (_key: string, value: string) => {
			saved = value;
		},
	};
	const preference = { sans: true, size: 20, fullWidth: true };
	writeReaderValue(storage, "preferences", JSON.stringify(preference));
	expect(readPreferences(storage, "preferences")).toEqual(preference);
	for (const fullWidth of [false, null, 1, "true"]) {
		saved = JSON.stringify({ fullWidth });
		expect(readPreferences(storage, "preferences").fullWidth).toBe(false);
	}
});
