export type DashboardAggregates = {
	watchlistCount: number;
	groupCount: number;
	memberCount: number;
	items24h: number;
	pendingAi: number;
	bySourceType: { sourceType: string; count: number }[];
};

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
	};
}
