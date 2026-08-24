import { describe, expect, test } from "vitest";
import {
	DASHBOARD_TREND_DAYS,
	eachUtcDay,
	fillUtcDays,
	getDashboardAggregates,
	utcDateKey,
} from "./dashboard.js";

describe("dashboard aggregates", () => {
	test("sums seeded counts", async () => {
		const db = {
			prepare(sql: string) {
				const binds: unknown[] = [];
				return {
					bind(...a: unknown[]) {
						binds.push(...a);
						return this;
					},
					async first<T>() {
						if (sql.includes("FROM watchlists")) return { c: 2 } as T;
						if (sql.includes("FROM groups")) return { c: 1 } as T;
						if (sql.includes("FROM watchlist_members")) return { c: 3 } as T;
						if (sql.includes("ingested_at_ms")) return { c: 4 } as T;
						if (sql.includes("ai_status")) return { c: 5 } as T;
						return { c: 0 } as T;
					},
					async all<T>() {
						if (sql.includes("SUM(accepted)")) {
							return {
								results: [{ date: "2026-08-20", accepted: 3, deduped: 1, rejected: 0 }] as T[],
							};
						}
						if (sql.includes("strftime") && sql.includes("FROM items")) {
							return { results: [{ date: "2026-08-20", count: 2 }] as T[] };
						}
						if (sql.includes("FROM ingest_logs")) {
							return {
								results: [
									{
										id: 1,
										watchlist_id: 1,
										attempted: 2,
										accepted: 1,
										deduped: 1,
										rejected: 0,
										errors_json: null,
										created_at_ms: 1,
										watchlist_name: "Alpha",
									},
								] as T[],
							};
						}
						return { results: [{ sourceType: "x.com", count: 4 }] as T[] };
					},
				};
			},
		} as unknown as D1Database;
		const now = Date.parse("2026-08-23T12:00:00.000Z");
		const a = await getDashboardAggregates(db, "u1", now);
		expect(a.watchlistCount).toBe(2);
		expect(a.pendingAi).toBe(5);
		expect(a.bySourceType[0]?.sourceType).toBe("x.com");
		expect(a.itemsTrend).toHaveLength(DASHBOARD_TREND_DAYS);
		expect(a.ingestTrend).toHaveLength(DASHBOARD_TREND_DAYS);
		expect(a.itemsTrend.find((p) => p.date === "2026-08-20")?.count).toBe(2);
		expect(a.ingestTrend.find((p) => p.date === "2026-08-20")).toEqual({
			date: "2026-08-20",
			accepted: 3,
			deduped: 1,
			rejected: 0,
		});
		expect(a.recentIngestLogs[0]?.watchlistName).toBe("Alpha");
	});

	test("fillUtcDays pads missing days in UTC", () => {
		const now = Date.parse("2026-08-23T18:00:00.000Z");
		expect(utcDateKey(now)).toBe("2026-08-23");
		expect(eachUtcDay(now, 3)).toEqual(["2026-08-21", "2026-08-22", "2026-08-23"]);
		const filled = fillUtcDays(now, 3, [{ date: "2026-08-22", count: 4 }], (date) => ({
			date,
			count: 0,
		}));
		expect(filled).toEqual([
			{ date: "2026-08-21", count: 0 },
			{ date: "2026-08-22", count: 4 },
			{ date: "2026-08-23", count: 0 },
		]);
	});
});
