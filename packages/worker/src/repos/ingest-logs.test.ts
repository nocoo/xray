import { describe, expect, test } from "vitest";
import { listIngestLogsForWatchlist, listRecentIngestLogs } from "./ingest-logs.js";

function mockDb(rows: Array<Record<string, unknown>>) {
	return {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					return {
						async all<T>() {
							let filtered = rows;
							if (sql.includes("watchlist_id = ?")) {
								filtered = rows.filter(
									(r) => r.user_id === binds[0] && r.watchlist_id === binds[1],
								);
							} else {
								filtered = rows.filter((r) => r.user_id === binds[0]);
							}
							const lim = Number(binds[binds.length - 1]);
							return { results: filtered.slice(0, lim) as T[] };
						},
					};
				},
			};
		},
	} as unknown as D1Database;
}

describe("ingest logs list", () => {
	test("scopes by user and watchlist", async () => {
		const db = mockDb([
			{
				id: 2,
				user_id: "u1",
				watchlist_id: 1,
				attempted: 3,
				accepted: 2,
				deduped: 1,
				rejected: 0,
				errors_json: null,
				created_at_ms: 200,
			},
			{
				id: 1,
				user_id: "u1",
				watchlist_id: 2,
				attempted: 1,
				accepted: 1,
				deduped: 0,
				rejected: 0,
				errors_json: null,
				created_at_ms: 100,
			},
			{
				id: 3,
				user_id: "u2",
				watchlist_id: 1,
				attempted: 9,
				accepted: 9,
				deduped: 0,
				rejected: 0,
				errors_json: null,
				created_at_ms: 300,
			},
		]);
		const wl = await listIngestLogsForWatchlist(db, "u1", 1, 10);
		expect(wl).toHaveLength(1);
		expect(wl[0]?.accepted).toBe(2);
		const recent = await listRecentIngestLogs(db, "u1", 10);
		expect(recent).toHaveLength(2);
		expect(recent.every((r) => r.watchlistId === 1 || r.watchlistId === 2)).toBe(true);
	});
});
