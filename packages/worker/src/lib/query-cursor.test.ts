import { describe, expect, test } from "vitest";
import { decodeQueryCursor, encodeQueryCursor, type QueryCursorContext } from "./query-cursor.js";

const context: QueryCursorContext = {
	tokenId: 1,
	accessJson: '{"mode":"all","watchlistIds":[],"channelIds":[]}',
	key: "cursor-test-key",
	query: {
		source: { kind: "watchlist", id: 1 },
		startMs: null,
		endMs: null,
		order: "asc",
		limit: 100,
		cursor: null,
	},
};
async function signed(raw: string) {
	const body = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(context.key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const value = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(
			JSON.stringify([
				body,
				context.tokenId,
				context.accessJson,
				"watchlist",
				1,
				null,
				null,
				"asc",
			]),
		),
	);
	const mac = Array.from(new Uint8Array(value), (v) => v.toString(16).padStart(2, "0")).join("");
	return `${body}.${mac}`;
}
describe("query cursor validation", () => {
	test("round-trips stable positions and permits page size changes", async () => {
		for (const kind of ["article", "post"] as const) {
			const position = { timeMs: -1, kind, id: 1 };
			const cursor = await encodeQueryCursor(position, context);
			expect(await decodeQueryCursor(cursor, context)).toEqual(position);
			expect(
				await decodeQueryCursor(cursor, { ...context, query: { ...context.query, limit: 1 } }),
			).toEqual(position);
		}
	});
	test("rejects invalid syntax, tampering, grants and filter context", async () => {
		for (const value of [
			"",
			"a",
			"a.b.c",
			".abc",
			`${"?"}.${"a".repeat(64)}`,
			`a.${"x".repeat(64)}`,
			`a.${"a".repeat(64)}`,
		])
			expect(await decodeQueryCursor(value, context)).toBeNull();
		const cursor = await encodeQueryCursor({ timeMs: 1, kind: "post", id: 1 }, context);
		for (const next of [
			{ ...context, tokenId: 2 },
			{ ...context, query: { ...context.query, source: { kind: "channel" as const, id: 1 } } },
			{ ...context, query: { ...context.query, source: { kind: "watchlist" as const, id: 2 } } },
			{ ...context, key: "different" },
			{ ...context, accessJson: "{}" },
			{ ...context, query: { ...context.query, startMs: 1 } },
			{ ...context, query: { ...context.query, endMs: 2 } },
			{ ...context, query: { ...context.query, order: "desc" as const } },
		])
			expect(await decodeQueryCursor(cursor, next)).toBeNull();
	});
	test("rejects signed malformed payloads and unsupported positions", async () => {
		for (const raw of [
			"broken",
			"null",
			"{}",
			"[1,2]",
			'[2,1,"post",1]',
			'[1,1,"other",1]',
			'[1,1,"post",0]',
			'[1,1.1,"post",1]',
			'[1,1,"post",1.1]',
			'[1,"1","post",1]',
			'[1,1,"post",9007199254740992]',
		])
			expect(await decodeQueryCursor(await signed(raw), context), raw).toBeNull();
	});
});
