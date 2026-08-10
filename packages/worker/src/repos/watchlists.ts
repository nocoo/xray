export type WatchlistRow = {
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	icon: string;
	translate_enabled: number;
	created_at_ms: number;
	member_count?: number;
};

export type WatchlistDto = {
	id: number;
	name: string;
	description: string | null;
	icon: string;
	translateEnabled: boolean;
	createdAtMs: number;
	memberCount: number;
};

export function toWatchlistDto(row: WatchlistRow): WatchlistDto {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		icon: row.icon,
		translateEnabled: row.translate_enabled === 1,
		createdAtMs: row.created_at_ms,
		memberCount: row.member_count ?? 0,
	};
}

export async function listWatchlists(db: D1Database, userId: string): Promise<WatchlistDto[]> {
	const { results } = await db
		.prepare(
			`SELECT w.*,
        (SELECT COUNT(*) FROM watchlist_members m WHERE m.watchlist_id = w.id) AS member_count
       FROM watchlists w
       WHERE w.user_id = ?
       ORDER BY w.id ASC`,
		)
		.bind(userId)
		.all<WatchlistRow>();
	return (results ?? []).map(toWatchlistDto);
}

export async function getWatchlist(
	db: D1Database,
	userId: string,
	id: number,
): Promise<WatchlistDto | null> {
	const row = await db
		.prepare(
			`SELECT w.*,
        (SELECT COUNT(*) FROM watchlist_members m WHERE m.watchlist_id = w.id) AS member_count
       FROM watchlists w
       WHERE w.user_id = ? AND w.id = ?
       LIMIT 1`,
		)
		.bind(userId, id)
		.first<WatchlistRow>();
	return row ? toWatchlistDto(row) : null;
}

export async function createWatchlist(
	db: D1Database,
	userId: string,
	input: { name: string; description?: string | null; icon?: string; translateEnabled?: boolean },
): Promise<WatchlistDto> {
	const now = Date.now();
	const name = input.name.trim();
	const icon = (input.icon?.trim() || "eye").slice(0, 64);
	const translate = input.translateEnabled === false ? 0 : 1;
	const result = await db
		.prepare(
			`INSERT INTO watchlists (user_id, name, description, icon, translate_enabled, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(userId, name, input.description?.trim() || null, icon, translate, now)
		.run();
	const id = Number(result.meta.last_row_id);
	const created = await getWatchlist(db, userId, id);
	if (!created) throw new Error("failed to load created watchlist");
	return created;
}

export async function updateWatchlist(
	db: D1Database,
	userId: string,
	id: number,
	input: {
		name?: string;
		description?: string | null;
		icon?: string;
		translateEnabled?: boolean;
	},
): Promise<WatchlistDto | null> {
	const existing = await getWatchlist(db, userId, id);
	if (!existing) return null;
	const name = input.name !== undefined ? input.name.trim() : existing.name;
	const description =
		input.description !== undefined ? input.description?.trim() || null : existing.description;
	const icon = input.icon !== undefined ? input.icon.trim().slice(0, 64) || "eye" : existing.icon;
	const translate =
		input.translateEnabled !== undefined
			? input.translateEnabled
				? 1
				: 0
			: existing.translateEnabled
				? 1
				: 0;
	await db
		.prepare(
			`UPDATE watchlists
       SET name = ?, description = ?, icon = ?, translate_enabled = ?
       WHERE user_id = ? AND id = ?`,
		)
		.bind(name, description, icon, translate, userId, id)
		.run();
	return getWatchlist(db, userId, id);
}

export async function deleteWatchlist(
	db: D1Database,
	userId: string,
	id: number,
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM watchlists WHERE user_id = ? AND id = ?`)
		.bind(userId, id)
		.run();
	return (result.meta.changes ?? 0) > 0;
}
