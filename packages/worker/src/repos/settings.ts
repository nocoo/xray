export async function getSetting(
	db: D1Database,
	userId: string,
	key: string,
): Promise<string | null> {
	const row = await db
		.prepare(`SELECT value FROM settings WHERE user_id = ? AND key = ? LIMIT 1`)
		.bind(userId, key)
		.first<{ value: string }>();
	return row?.value ?? null;
}

export async function setSetting(
	db: D1Database,
	userId: string,
	key: string,
	value: string,
): Promise<void> {
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO settings (user_id, key, value, updated_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
		)
		.bind(userId, key, value, now)
		.run();
}

export async function getWindowHours(db: D1Database, userId: string): Promise<number> {
	const raw = await getSetting(db, userId, "ingest.windowHours");
	const n = raw ? Number(raw) : 24;
	if (!Number.isFinite(n)) return 24;
	return Math.min(168, Math.max(1, Math.floor(n)));
}
