export type IngestLogDto = {
	id: number;
	watchlistId: number;
	attempted: number;
	accepted: number;
	deduped: number;
	rejected: number;
	errorsJson: string | null;
	createdAtMs: number;
};

type IngestLogRow = {
	id: number;
	watchlist_id: number;
	attempted: number;
	accepted: number;
	deduped: number;
	rejected: number;
	errors_json: string | null;
	created_at_ms: number;
};

function toDto(row: IngestLogRow): IngestLogDto {
	return {
		id: row.id,
		watchlistId: row.watchlist_id,
		attempted: row.attempted,
		accepted: row.accepted,
		deduped: row.deduped,
		rejected: row.rejected,
		errorsJson: row.errors_json,
		createdAtMs: row.created_at_ms,
	};
}

/** Recent logs for one watchlist (tenant-scoped). */
function clampLimit(limit: number, fallback: number, max: number): number {
	if (!Number.isFinite(limit)) return fallback;
	const n = Math.trunc(limit);
	if (!Number.isSafeInteger(n) || n < 1) return fallback;
	return Math.min(n, max);
}

export async function listIngestLogsForWatchlist(
	db: D1Database,
	userId: string,
	watchlistId: number,
	limit = 20,
): Promise<IngestLogDto[]> {
	const lim = clampLimit(limit, 20, 100);
	// ownership via user_id on logs
	const { results } = await db
		.prepare(
			`SELECT id, watchlist_id, attempted, accepted, deduped, rejected, errors_json, created_at_ms
       FROM ingest_logs
       WHERE user_id = ? AND watchlist_id = ?
       ORDER BY created_at_ms DESC, id DESC
       LIMIT ?`,
		)
		.bind(userId, watchlistId, lim)
		.all<IngestLogRow>();
	return (results ?? []).map(toDto);
}

/** Cross-watchlist recent activity for dashboard. */
export async function listRecentIngestLogs(
	db: D1Database,
	userId: string,
	limit = 10,
): Promise<IngestLogDto[]> {
	const lim = clampLimit(limit, 10, 50);
	const { results } = await db
		.prepare(
			`SELECT id, watchlist_id, attempted, accepted, deduped, rejected, errors_json, created_at_ms
       FROM ingest_logs
       WHERE user_id = ?
       ORDER BY created_at_ms DESC, id DESC
       LIMIT ?`,
		)
		.bind(userId, lim)
		.all<IngestLogRow>();
	return (results ?? []).map(toDto);
}
