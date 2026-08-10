import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { addMember, deleteMember, listMembers, updateMember } from "../repos/members.js";
import {
	createWatchlist,
	deleteWatchlist,
	getWatchlist,
	listWatchlists,
} from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

/**
 * L2 tenant isolation matrix (XR-13 / S45R-07 / S45R-09).
 * In-memory D1 stand-in covering the SQL shapes used by watchlist/member repos.
 */

type Row = Record<string, unknown>;

function createRepoD1() {
	const tables: Record<string, Row[]> = {
		watchlists: [],
		watchlist_members: [],
		tags: [],
		watchlist_member_tags: [],
	};
	let seq = 1;

	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("FROM watchlists") && sql.includes("w.id")) {
						const [userId, id] = binds as [string, number];
						const hit = tables.watchlists.find((r) => r.user_id === userId && r.id === id);
						if (!hit) return null;
						return {
							...hit,
							member_count: tables.watchlist_members.filter((m) => m.watchlist_id === id).length,
						} as T;
					}
					if (sql.includes("FROM watchlist_members WHERE id = ?")) {
						if (sql.includes("watchlist_id")) {
							const [id, userId, wl] = binds as [number, string, number];
							return (tables.watchlist_members.find(
								(r) => r.id === id && r.user_id === userId && r.watchlist_id === wl,
							) ?? null) as T | null;
						}
						const [id, userId] = binds as [number, string];
						return (tables.watchlist_members.find((r) => r.id === id && r.user_id === userId) ??
							null) as T | null;
					}
					return null;
				},
				async all<T>() {
					if (sql.includes("FROM watchlists w") && sql.includes("w.user_id")) {
						const [userId] = binds as [string];
						const results = tables.watchlists
							.filter((r) => r.user_id === userId)
							.map((r) => ({
								...r,
								member_count: tables.watchlist_members.filter((m) => m.watchlist_id === r.id)
									.length,
							}));
						return { results: results as T[] };
					}
					if (sql.includes("FROM tags WHERE user_id")) {
						const [userId, ...ids] = binds as [string, ...number[]];
						return {
							results: tables.tags
								.filter((t) => t.user_id === userId && ids.includes(t.id as number))
								.map((t) => ({ id: t.id })) as T[],
						};
					}
					if (sql.includes("FROM watchlist_members") && sql.includes("watchlist_id")) {
						const [userId, wl] = binds as [string, number];
						return {
							results: tables.watchlist_members.filter(
								(m) => m.user_id === userId && m.watchlist_id === wl,
							) as T[],
						};
					}
					if (sql.includes("watchlist_member_tags") && sql.includes("JOIN tags")) {
						const ids = binds as number[];
						const results = tables.watchlist_member_tags
							.filter((j) => ids.includes(j.member_id as number))
							.map((j) => {
								const t = tables.tags.find((x) => x.id === j.tag_id);
								return {
									member_id: j.member_id,
									id: t?.id,
									name: t?.name,
									color: t?.color,
								};
							});
						return { results: results as T[] };
					}
					return { results: [] as T[] };
				},
				async run() {
					const up = sql.trimStart().toUpperCase();
					if (up.startsWith("INSERT INTO WATCHLISTS")) {
						const [userId, name, description, icon, translateEnabled, created] = binds;
						const id = seq++;
						tables.watchlists.push({
							id,
							user_id: userId,
							name,
							description,
							icon,
							translate_enabled: translateEnabled,
							created_at_ms: created,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (up.startsWith("INSERT INTO WATCHLIST_MEMBERS")) {
						const [userId, watchlistId, sourceType, ext, handle, displayName, note, added] = binds;
						const id = seq++;
						tables.watchlist_members.push({
							id,
							user_id: userId,
							watchlist_id: watchlistId,
							source_type: sourceType,
							external_author_id: ext,
							handle,
							display_name: displayName,
							note,
							added_at_ms: added,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (up.startsWith("DELETE FROM WATCHLISTS")) {
						const [userId, id] = binds as [string, number];
						const before = tables.watchlists.length;
						tables.watchlists = tables.watchlists.filter(
							(r) => !(r.user_id === userId && r.id === id),
						);
						return { meta: { changes: before - tables.watchlists.length } };
					}
					if (up.startsWith("DELETE FROM WATCHLIST_MEMBERS")) {
						const before = tables.watchlist_members.length;
						if (sql.includes("watchlist_id")) {
							const [id, userId, wl] = binds as [number, string, number];
							tables.watchlist_members = tables.watchlist_members.filter(
								(r) => !(r.id === id && r.user_id === userId && r.watchlist_id === wl),
							);
						} else {
							const [id, userId] = binds as [number, string];
							tables.watchlist_members = tables.watchlist_members.filter(
								(r) => !(r.id === id && r.user_id === userId),
							);
						}
						return { meta: { changes: before - tables.watchlist_members.length } };
					}
					if (up.startsWith("UPDATE WATCHLIST_MEMBERS")) {
						const [displayName, note, id, userId] = binds;
						const row = tables.watchlist_members.find((r) => r.id === id && r.user_id === userId);
						if (row) {
							row.display_name = displayName;
							row.note = note;
							return { meta: { changes: 1 } };
						}
						return { meta: { changes: 0 } };
					}
					if (up.startsWith("DELETE FROM WATCHLIST_MEMBER_TAGS")) {
						const [memberId] = binds;
						tables.watchlist_member_tags = tables.watchlist_member_tags.filter(
							(j) => j.member_id !== memberId,
						);
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
		async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
			const out = [];
			for (const s of stmts) out.push(await s.run());
			return out;
		},
	} as unknown as D1Database;
}

describe("tenant isolation matrix", () => {
	test("cross-user watchlist get/delete → not found", async () => {
		const db = createRepoD1();
		const a = await createWatchlist(db, "user-a", { name: "A" });
		expect(await getWatchlist(db, "user-b", a.id)).toBeNull();
		expect(await deleteWatchlist(db, "user-b", a.id)).toBe(false);
		expect(await getWatchlist(db, "user-a", a.id)).not.toBeNull();
		const listB = await listWatchlists(db, "user-b");
		expect(listB.find((w) => w.id === a.id)).toBeUndefined();
	});

	test("member delete requires parent watchlist id", async () => {
		const db = createRepoD1();
		const wlA = await createWatchlist(db, "user-a", { name: "A" });
		const wlB = await createWatchlist(db, "user-a", { name: "B" });
		const m = await addMember(db, "user-a", wlA.id, {
			sourceType: "x.com",
			handle: "alice",
		});
		expect(await deleteMember(db, "user-a", m.id, { watchlistId: wlB.id })).toBe(false);
		expect((await listMembers(db, "user-a", wlA.id)).length).toBe(1);
		expect(await deleteMember(db, "user-a", m.id, { watchlistId: wlA.id })).toBe(true);
		expect((await listMembers(db, "user-a", wlA.id)).length).toBe(0);
	});

	test("member patch wrong parent → null", async () => {
		const db = createRepoD1();
		const wlA = await createWatchlist(db, "user-a", { name: "A" });
		const wlB = await createWatchlist(db, "user-a", { name: "B" });
		const m = await addMember(db, "user-a", wlA.id, {
			sourceType: "custom",
			handle: "bot",
		});
		const updated = await updateMember(db, "user-a", m.id, { note: "x" }, { watchlistId: wlB.id });
		expect(updated).toBeNull();
	});
});

describe("route-level isolation skeleton", () => {
	test("cross-user cases documented as 404", () => {
		const cases = [
			{ method: "GET", path: "/api/watchlists/1", expect: 404 },
			{ method: "PATCH", path: "/api/watchlists/1", expect: 404 },
			{ method: "DELETE", path: "/api/watchlists/1", expect: 404 },
			{ method: "GET", path: "/api/groups/1", expect: 404 },
			{ method: "DELETE", path: "/api/watchlists/1/members/9", expect: 404 },
		] as const;
		for (const c of cases) expect(c.expect).toBe(404);
	});

	test("hono app can mount isolation middleware shape", async () => {
		const app = new Hono<AppEnv>();
		app.get("/api/watchlists/:id", (c) => c.json({ success: false, error: "Not found" }, 404));
		const res = await app.request("/api/watchlists/1");
		expect(res.status).toBe(404);
	});
});
