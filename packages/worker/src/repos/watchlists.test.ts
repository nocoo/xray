import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test/mock-d1.js";
import {
	createWatchlist,
	deleteWatchlist,
	getWatchlist,
	listWatchlists,
	updateWatchlist,
} from "./watchlists.js";

// Use a richer mock that tracks tables for S4 repos.
type Row = Record<string, unknown>;

function createRepoDb() {
	const tables: Record<string, Row[]> = {
		watchlists: [],
		watchlist_members: [],
	};
	let seq = 1;
	const db = {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					const s = sql.replace(/\s+/g, " ");
					if (s.includes("FROM watchlists w") && s.includes("AND w.id = ?")) {
						const [userId, id] = binds as [string, number];
						const w = tables.watchlists.find((r) => r.user_id === userId && r.id === id) as
							| Row
							| undefined;
						if (!w) return null;
						const member_count = tables.watchlist_members.filter(
							(m) => m.watchlist_id === id,
						).length;
						return { ...w, member_count } as T;
					}
					return null;
				},
				async all<T>() {
					const s = sql.replace(/\s+/g, " ");
					if (s.includes("FROM watchlists w") && s.includes("WHERE w.user_id = ?")) {
						const [userId] = binds as [string];
						const results = tables.watchlists
							.filter((r) => r.user_id === userId)
							.map((w) => ({
								...w,
								member_count: tables.watchlist_members.filter((m) => m.watchlist_id === w.id)
									.length,
							}));
						return { results: results as T[] };
					}
					return { results: [] as T[] };
				},
				async run() {
					const s = sql.replace(/\s+/g, " ");
					if (s.startsWith("INSERT INTO watchlists")) {
						const [user_id, name, description, icon, translate_enabled, created_at_ms] = binds as [
							string,
							string,
							string | null,
							string,
							number,
							number,
						];
						const id = seq++;
						tables.watchlists.push({
							id,
							user_id,
							name,
							description,
							icon,
							translate_enabled,
							created_at_ms,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (s.startsWith("UPDATE watchlists")) {
						const [name, description, icon, translate_enabled, userId, id] = binds as [
							string,
							string | null,
							string,
							number,
							string,
							number,
						];
						const w = tables.watchlists.find((r) => r.user_id === userId && r.id === id);
						if (w) {
							w.name = name;
							w.description = description;
							w.icon = icon;
							w.translate_enabled = translate_enabled;
							return { meta: { changes: 1 } };
						}
						return { meta: { changes: 0 } };
					}
					if (s.startsWith("DELETE FROM watchlists")) {
						const [userId, id] = binds as [string, number];
						const before = tables.watchlists.length;
						tables.watchlists = tables.watchlists.filter(
							(r) => !(r.user_id === userId && r.id === id),
						);
						return { meta: { changes: before - tables.watchlists.length } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	};
	return db as unknown as D1Database;
}

describe("watchlists repo", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createRepoDb();
	});

	test("create list get update delete", async () => {
		const created = await createWatchlist(db, "u1", { name: "AI" });
		expect(created.name).toBe("AI");
		expect(created.translateEnabled).toBe(true);

		const list = await listWatchlists(db, "u1");
		expect(list).toHaveLength(1);

		const got = await getWatchlist(db, "u1", created.id);
		expect(got?.name).toBe("AI");
		expect(await getWatchlist(db, "other", created.id)).toBeNull();

		const updated = await updateWatchlist(db, "u1", created.id, {
			name: "AI2",
			translateEnabled: false,
		});
		expect(updated?.name).toBe("AI2");
		expect(updated?.translateEnabled).toBe(false);

		expect(await deleteWatchlist(db, "u1", created.id)).toBe(true);
		expect(await listWatchlists(db, "u1")).toHaveLength(0);
	});

	test("smoke mock-d1 still constructs", () => {
		expect(createMockD1([])).toBeTruthy();
	});
});
