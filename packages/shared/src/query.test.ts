import { describe, expect, test } from "vitest";
import { parseContentQuery } from "./query.js";
import { parseQueryTokenAccess, parseQueryTokenInput } from "./tokens.js";

const all = { mode: "all", watchlistIds: [], channelIds: [] };
describe("query token contracts", () => {
	test("valid access is canonical and never expands empty selection", () => {
		expect(parseQueryTokenInput({ label: "  Reader ", access: all })).toEqual({
			ok: true,
			value: { label: "Reader", access: all },
		});
		expect(
			parseQueryTokenAccess({ mode: "selected", watchlistIds: [3, 1, 3], channelIds: [2, 2] }),
		).toEqual({ ok: true, value: { mode: "selected", watchlistIds: [1, 3], channelIds: [2] } });
		expect(parseQueryTokenAccess({ ...all, mode: "selected" }).ok).toBe(false);
		expect(parseQueryTokenAccess({ ...all, mode: "selected" }, true)).toEqual({
			ok: true,
			value: { ...all, mode: "selected" },
		});
		expect(
			parseQueryTokenAccess({
				mode: "selected",
				watchlistIds: Array.from({ length: 100 }, (_, i) => i + 1),
				channelIds: [],
			}).ok,
		).toBe(true);
	});
	test("rejects malformed, broadening and oversized grants", () => {
		for (const access of [
			null,
			[],
			"all",
			{},
			{ ...all, mode: "other" },
			{ ...all, extra: true },
			{ ...all, channelIds: null },
			{ ...all, watchlistIds: [1] },
			{ ...all, mode: "selected", watchlistIds: [0] },
			{ ...all, mode: "selected", channelIds: ["1"] },
			{ ...all, mode: "selected", channelIds: [1.2] },
			{ ...all, mode: "selected", channelIds: [Number.MAX_SAFE_INTEGER + 1] },
			{ ...all, mode: "selected", watchlistIds: Array.from({ length: 101 }, (_, i) => i + 1) },
		]) {
			expect(parseQueryTokenAccess(access).ok, JSON.stringify(access)).toBe(false);
		}
		for (const body of [
			null,
			{ label: "" },
			{ label: "x", access: null },
			{ label: "x", access: all, scopes: ["ingest:push"] },
		])
			expect(parseQueryTokenInput(body).ok).toBe(false);
	});
	test("parses UTC intervals and defaults", () => {
		expect(parseContentQuery({ watchlistId: "1" })).toEqual({
			ok: true,
			value: {
				source: { kind: "watchlist", id: 1 },
				startMs: null,
				endMs: null,
				order: "desc",
				limit: 100,
				cursor: null,
			},
		});
		const start = "2026-10-14T00:00:00Z",
			end = "2026-10-15T00:00:00.123Z";
		expect(
			parseContentQuery({ channelId: "2", start, end, order: "asc", limit: "1", cursor: "abc" }),
		).toEqual({
			ok: true,
			value: {
				source: { kind: "channel", id: 2 },
				startMs: Date.parse(start),
				endMs: Date.parse(end),
				order: "asc",
				limit: 1,
				cursor: "abc",
			},
		});
		expect(parseContentQuery({ watchlistId: "1", start: "0001-01-01T00:00:00.1Z" }).ok).toBe(true);
		expect(parseContentQuery({ watchlistId: "1", end: "2026-10-14T00:00:00.12Z" }).ok).toBe(true);
	});
	test("requires exactly one canonical positive source ID", () => {
		for (const raw of [
			{},
			{ watchlistId: "1", channelId: "2" },
			...["", "0", "-1", "1.5", "1e2", "01", " 1", "9007199254740992"].flatMap((id) => [
				{ watchlistId: id },
				{ channelId: id },
			]),
		])
			expect(parseContentQuery(raw).ok).toBe(false);
	});
	test("rejects invalid dates, precision and query options", () => {
		for (const raw of [
			{ start: "" },
			{ start: "2026-02-30T00:00:00Z" },
			{ start: "2026-10-14" },
			{ start: "2026-10-14T00:00:00+00:00" },
			{ start: "2026-10-14T00:00:00.1234Z" },
			{ start: "2026-10-14T24:00:00Z" },
			{ start: "2026-10-14T00:60:00Z" },
			{ end: "2026-10-14T00:00:60Z" },
			{ start: "2026-10-15T00:00:00Z", end: "2026-10-14T00:00:00Z" },
			{ start: "2026-10-14T00:00:00Z", end: "2026-10-14T00:00:00Z" },
			{ order: "random" },
			{ limit: "0" },
			{ limit: "101" },
			{ limit: "NaN" },
			{ limit: "1.5" },
			{ cursor: "" },
			{ cursor: "x".repeat(2049) },
			{ tenant: "other" },
		])
			expect(parseContentQuery({ watchlistId: "1", ...raw }).ok, JSON.stringify(raw)).toBe(false);
	});
});
