import type { ContentDayPoint, DashboardAggregates, DashboardLog } from "@xray/shared";

export const DASHBOARD_TREND_DAYS = 14;

const CONTENT_SQL = `WITH content AS (
  SELECT ingested_at_ms AS received_at_ms
  FROM items WHERE user_id = ?
  UNION ALL
  SELECT created_at_ms
  FROM channel_articles WHERE user_id = ?
)`;

type TrendRow = { date: string; count: number } & (
	| { channelId: null; channelName: null }
	| { channelId: number; channelName: string }
);

function emptyDay(date: string): ContentDayPoint {
	return { date, watchlists: 0, channels: 0, channelReports: [] };
}

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
	const channels = await db
		.prepare(`SELECT COUNT(*) AS c FROM channels WHERE user_id = ?`)
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
	const content = await db
		.prepare(`${CONTENT_SQL}
      SELECT COUNT(*) AS total,
             COALESCE(SUM(received_at_ms >= ? AND received_at_ms <= ?), 0) AS recent
      FROM content`)
		.bind(userId, userId, since, nowMs)
		.first<{ total: number; recent: number }>();
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
	const trendSince = Date.parse(`${eachUtcDay(nowMs, DASHBOARD_TREND_DAYS)[0]}T00:00:00Z`);
	const { results: contentDays } = await db
		.prepare(`SELECT strftime('%Y-%m-%d', ingested_at_ms / 1000, 'unixepoch') AS date,
             NULL AS channelId, NULL AS channelName, COUNT(*) AS count
      FROM items WHERE user_id = ? AND ingested_at_ms BETWEEN ? AND ?
      GROUP BY date
      UNION ALL
      SELECT strftime('%Y-%m-%d', a.created_at_ms / 1000, 'unixepoch') AS date,
             a.channel_id, c.name, COUNT(*)
      FROM channel_articles a
      JOIN channels c ON c.id = a.channel_id AND c.user_id = a.user_id
      WHERE a.user_id = ? AND a.created_at_ms BETWEEN ? AND ?
      GROUP BY date, a.channel_id
      ORDER BY date, channelId`)
		.bind(userId, trendSince, nowMs, userId, trendSince, nowMs)
		.all<TrendRow>();
	const byDate = new Map<string, ContentDayPoint>();
	for (const row of contentDays ?? []) {
		const point = byDate.get(row.date) ?? emptyDay(row.date);
		if (row.channelId === null) point.watchlists = row.count;
		else {
			point.channels += row.count;
			point.channelReports.push({ id: row.channelId, name: row.channelName, count: row.count });
		}
		byDate.set(row.date, point);
	}

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
			watchlist_id: number | null;
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
		channelCount: Number(channels?.c ?? 0),
		groupCount: Number(groups?.c ?? 0),
		memberCount: Number(members?.c ?? 0),
		contentCount: Number(content?.total ?? 0),
		content24h: Number(content?.recent ?? 0),
		pendingAi: Number(pendingAi?.c ?? 0),
		contentTrend: fillUtcDays(nowMs, DASHBOARD_TREND_DAYS, [...byDate.values()], emptyDay),
		recentIngestLogs,
	};
}
