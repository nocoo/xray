import { describe, expect, test } from "vitest";
import { getDashboardAggregates } from "./dashboard.js";

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
						return { results: [{ sourceType: "x.com", count: 4 }] as T[] };
					},
				};
			},
		} as unknown as D1Database;
		const a = await getDashboardAggregates(db, "u1", Date.now());
		expect(a.watchlistCount).toBe(2);
		expect(a.pendingAi).toBe(5);
		expect(a.bySourceType[0]?.sourceType).toBe("x.com");
	});
});
