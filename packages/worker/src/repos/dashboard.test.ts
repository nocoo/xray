import { describe, expect, test } from "vitest";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import {
	DASHBOARD_TREND_DAYS,
	eachUtcDay,
	fillUtcDays,
	getDashboardAggregates,
	utcDateKey,
} from "./dashboard.js";

const now = Date.parse("2026-09-27T04:00:00Z");
const day = 86_400_000;

async function seededDb() {
	const db = createSqliteD1();
	await db.exec(`
  INSERT INTO users (id,email,created_at_ms) VALUES ('u1','one@test.local',0),('u2','two@test.local',0);
  INSERT INTO watchlists (id,user_id,name,translate_enabled,created_at_ms) VALUES (1,'u1','Alpha',1,0),(2,'u2','Other',1,0),(3,'u1','No AI',0,0);
  INSERT INTO channels (id,user_id,name,created_at_ms) VALUES (1,'u1','Reports',0),(2,'u2','Other',0);
  INSERT INTO push_tokens (id,user_id,token_prefix,token_hash,label,scopes,created_at_ms,channel_id)
   VALUES (1,'u1','one','one','Reporter','["articles:write"]',0,1),(2,'u2','two','two','Other','["articles:write"]',0,2);
  INSERT INTO groups (user_id,name,created_at_ms) VALUES ('u1','Team',0),('u2','Other',0);
  INSERT INTO watchlist_members (user_id,watchlist_id,source_type,handle,added_at_ms) VALUES ('u1',1,'x.com','author',0),('u2',2,'x.com','other',0);
 `);
	return db;
}

async function item(
	db: D1Database,
	id: string,
	received: number,
	userId = "u1",
	watchlistId = userId === "u1" ? 1 : 2,
	source = "custom",
	status = "not_requested",
) {
	await db
		.prepare(`INSERT INTO items (user_id,watchlist_id,source_type,external_id,text,created_at_ms,ingested_at_ms,payload_json,ai_status)
 VALUES (?,?,?,?,?,0,?,'{}',?)`)
		.bind(userId, watchlistId, source, id, id, received, status)
		.run();
}

async function report(db: D1Database, id: string, received: number, userId = "u1") {
	const channelId = userId === "u1" ? 1 : 2;
	await db
		.prepare(`INSERT INTO channel_articles (user_id,channel_id,external_id,title,report_date,markdown,source_key_id,source_label,created_at_ms)
 VALUES (?,?,?,?,'2000-01-01','# Report',?,'Reporter',?)`)
		.bind(userId, channelId, id, id, channelId, received)
		.run();
}

describe("dashboard aggregates", () => {
	test("counts both content categories once, using arrival times and tenant ownership", async () => {
		const db = await seededDb();
		await item(db, "x", now, "u1", 1, "x.com");
		await item(db, "custom", now - day);
		await item(db, "disabled", now, "u1", 3);
		await item(db, "translated", now, "u1", 1, "custom", "succeeded");
		await report(db, "report", now);
		await item(db, "foreign", now, "u2");
		await report(db, "foreign", now, "u2");
		await expect(report(db, "report", now)).rejects.toThrow(/UNIQUE/);
		await expect(item(db, "custom", now)).rejects.toThrow(/UNIQUE/);
		await db.exec(`INSERT INTO ingest_logs (user_id,watchlist_id,attempted,accepted,deduped,rejected,created_at_ms)
   VALUES ('u1',1,20,4,10,6,1),('u2',2,90,90,0,0,2)`);
		const result = await getDashboardAggregates(db, "u1", now);
		expect(result).toMatchObject({
			watchlistCount: 2,
			channelCount: 1,
			groupCount: 1,
			memberCount: 1,
			contentCount: 5,
			content24h: 5,
			pendingAi: 2,
		});
		expect(result.contentTrend).toHaveLength(DASHBOARD_TREND_DAYS);
		expect(result.contentTrend.slice(-2)).toEqual([
			{ date: "2026-09-26", watchlists: 1, channels: 0 },
			{ date: "2026-09-27", watchlists: 3, channels: 1 },
		]);
		expect(result.recentIngestLogs).toHaveLength(1);
		expect(result.recentIngestLogs[0]).toMatchObject({
			watchlistName: "Alpha",
			deduped: 10,
			rejected: 6,
		});
	});

	test("uses exact UTC calendar and rolling 24-hour bounds for both categories", async () => {
		const db = await seededDb();
		const start = Date.parse("2026-09-14T00:00:00Z");
		for (const [name, time] of Object.entries({
			before: start - 1,
			start,
			old: now - day - 1,
			recent: now - day,
			now,
			future: now + 1,
		})) {
			await item(db, name, time);
			await report(db, name, time);
		}
		const result = await getDashboardAggregates(db, "u1", now);
		expect(result.contentCount).toBe(12);
		expect(result.content24h).toBe(4);
		expect(result.contentTrend[0]).toEqual({ date: "2026-09-14", watchlists: 1, channels: 1 });
		expect(result.contentTrend.at(-1)).toEqual({ date: "2026-09-27", watchlists: 1, channels: 1 });
		expect(result.contentTrend.reduce((sum, p) => sum + p.watchlists + p.channels, 0)).toBe(8);
		expect(result.contentTrend.filter((p) => p.watchlists === 0 && p.channels === 0)).toHaveLength(
			11,
		);
	});

	test("supports empty and channel-only accounts", async () => {
		const db = await seededDb();
		const empty = await getDashboardAggregates(db, "missing", now);
		expect(empty).toMatchObject({
			watchlistCount: 0,
			channelCount: 0,
			groupCount: 0,
			memberCount: 0,
			contentCount: 0,
			content24h: 0,
			pendingAi: 0,
			recentIngestLogs: [],
		});
		expect(empty.contentTrend.every((p) => p.watchlists === 0 && p.channels === 0)).toBe(true);
		await db.exec("DELETE FROM watchlists WHERE user_id = 'u1'");
		await report(db, "only-report", now);
		const result = await getDashboardAggregates(db, "u1", now);
		expect(result).toMatchObject({
			watchlistCount: 0,
			channelCount: 1,
			contentCount: 1,
			content24h: 1,
			pendingAi: 0,
		});
		expect(result.contentTrend.at(-1)).toEqual({ date: "2026-09-27", watchlists: 0, channels: 1 });
	});

	test("preserves diagnostics for deleted watchlists and limits recent rows", async () => {
		const db = await seededDb();
		for (let i = 0; i < 14; i++)
			await db
				.prepare(
					`INSERT INTO ingest_logs (user_id,watchlist_id,attempted,accepted,deduped,rejected,created_at_ms) VALUES ('u1',1,1,0,1,0,?)`,
				)
				.bind(i)
				.run();
		await db.exec("DELETE FROM watchlists WHERE id = 1");
		const result = await getDashboardAggregates(db, "u1", now);
		expect(result.recentIngestLogs).toHaveLength(12);
		expect(result.recentIngestLogs[0]).toMatchObject({
			watchlistName: null,
			watchlistId: null,
			createdAtMs: 13,
		});
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
