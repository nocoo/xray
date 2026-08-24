import type { IngestLogDto } from "./ingest-logs.js";

export const DASHBOARD_TREND_DAYS = 14;

export type ItemDayPoint = { date: string; count: number };
export type IngestDayPoint = {
	date: string;
	accepted: number;
	deduped: number;
	rejected: number;
};

export type DashboardLog = IngestLogDto & { watchlistName: string | null };

export type DashboardAggregates = {
	watchlistCount: number;
	groupCount: number;
	memberCount: number;
	items24h: number;
	pendingAi: number;
	bySourceType: { sourceType: string; count: number }[];
	itemsTrend: ItemDayPoint[];
	ingestTrend: IngestDayPoint[];
	recentIngestLogs: DashboardLog[];
};

export function utcDateKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function eachUtcDay(nowMs: number, days: number): string[] {
	const start = Date.UTC(
		new Date(nowMs).getUTCFullYear(),
		new Date(nowMs).getUTCMonth(),
		new Date(nowMs).getUTCDate(),
	);
	const out: string[] = [];
	for (let i = days - 1; i >= 0; i--) {
		out.push(utcDateKey(start - i * 86_400_000));
	}
	return out;
}

export function fillUtcDays<T extends { date: string }>(
	nowMs: number,
	days: number,
	rows: T[],
	empty: (date: string) => T,
): T[] {
	const byDate = new Map(rows.map((r) => [r.date, r]));
	return eachUtcDay(nowMs, days).map((date) => byDate.get(date) ?? empty(date));
}

export async function getDashboardAggregates(
	db: D1Database,
	userId: string,
	nowMs = Date.now(),
): Promise<DashboardAggregates> {
	const since = nowMs - 24 * 3600_000;

	const wl = await db
		.prepare(`SELECT COUNT(*) AS c FROM watchlists WHERE user_id = ?`)
		.bind(userId)
		.first<{ c: number }>();
	const groups = await db
		.prepare(`SELECT COUNT(*) AS c FROM groups WHERE user_id = ?`)
		.bind(userId)
		.first<{ c: number }>();
	const members = await db
		.prepare(`SELECT COUNT(*) AS c FROM watchlist_members WHERE user_id = ?`)
		.bind(userId)
		.first<{ c: number }>();
	const items24h = await db
		.prepare(`SELECT COUNT(*) AS c FROM items WHERE user_id = ? AND ingested_at_ms >= ?`)
		.bind(userId, since)
		.first<{ c: number }>();
	const pendingAi = await db
		.prepare(
			`SELECT COUNT(*) AS c
       FROM items i
       JOIN watchlists w ON w.id = i.watchlist_id AND w.user_id = i.user_id
       WHERE i.user_id = ?
         AND w.translate_enabled = 1
         AND i.ai_status IN ('pending', 'not_requested')`,
		)
		.bind(userId)
		.first<{ c: number }>();
	const { results: bySource } = await db
		.prepare(
			`SELECT source_type AS sourceType, COUNT(*) AS count
       FROM items WHERE user_id = ?
       GROUP BY source_type`,
		)
		.bind(userId)
		.all<{ sourceType: string; count: number }>();

	const trendSince = nowMs - DASHBOARD_TREND_DAYS * 86_400_000;
	const { results: itemDays } = await db
		.prepare(
			`SELECT strftime('%Y-%m-%d', ingested_at_ms / 1000, 'unixepoch') AS date, COUNT(*) AS count
       FROM items
       WHERE user_id = ? AND ingested_at_ms >= ?
       GROUP BY date
       ORDER BY date`,
		)
		.bind(userId, trendSince)
		.all<{ date: string; count: number }>();
	const { results: ingestDays } = await db
		.prepare(
			`SELECT strftime('%Y-%m-%d', created_at_ms / 1000, 'unixepoch') AS date,
              SUM(accepted) AS accepted,
              SUM(deduped) AS deduped,
              SUM(rejected) AS rejected
       FROM ingest_logs
       WHERE user_id = ? AND created_at_ms >= ?
       GROUP BY date
       ORDER BY date`,
		)
		.bind(userId, trendSince)
		.all<{ date: string; accepted: number; deduped: number; rejected: number }>();

	const { results: logRows } = await db
		.prepare(
			`SELECT l.id, l.watchlist_id, l.attempted, l.accepted, l.deduped, l.rejected,
              l.errors_json, l.created_at_ms, w.name AS watchlist_name
       FROM ingest_logs l
       LEFT JOIN watchlists w ON w.id = l.watchlist_id AND w.user_id = l.user_id
       WHERE l.user_id = ?
       ORDER BY l.created_at_ms DESC, l.id DESC
       LIMIT 12`,
		)
		.bind(userId)
		.all<{
			id: number;
			watchlist_id: number;
			attempted: number;
			accepted: number;
			deduped: number;
			rejected: number;
			errors_json: string | null;
			created_at_ms: number;
			watchlist_name: string | null;
		}>();

	const recentIngestLogs: DashboardLog[] = (logRows ?? []).map((row) => ({
		id: row.id,
		watchlistId: row.watchlist_id,
		attempted: row.attempted,
		accepted: row.accepted,
		deduped: row.deduped,
		rejected: row.rejected,
		errorsJson: row.errors_json,
		createdAtMs: row.created_at_ms,
		watchlistName: row.watchlist_name ?? null,
	}));

	return {
		watchlistCount: Number(wl?.c ?? 0),
		groupCount: Number(groups?.c ?? 0),
		memberCount: Number(members?.c ?? 0),
		items24h: Number(items24h?.c ?? 0),
		pendingAi: Number(pendingAi?.c ?? 0),
		bySourceType: (bySource ?? []).map((r) => ({
			sourceType: r.sourceType,
			count: Number(r.count),
		})),
		itemsTrend: fillUtcDays(
			nowMs,
			DASHBOARD_TREND_DAYS,
			(itemDays ?? []).map((r) => ({ date: r.date, count: Number(r.count) })),
			(date) => ({ date, count: 0 }),
		),
		ingestTrend: fillUtcDays(
			nowMs,
			DASHBOARD_TREND_DAYS,
			(ingestDays ?? []).map((r) => ({
				date: r.date,
				accepted: Number(r.accepted),
				deduped: Number(r.deduped),
				rejected: Number(r.rejected),
			})),
			(date) => ({ date, accepted: 0, deduped: 0, rejected: 0 }),
		),
		recentIngestLogs,
	};
}
