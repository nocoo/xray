export type TagRow = {
	id: number;
	user_id: string;
	name: string;
	color: string;
};

export type TagDto = { id: number; name: string; color: string };

export function toTagDto(row: TagRow): TagDto {
	return { id: row.id, name: row.name, color: row.color };
}

export async function listTags(db: D1Database, userId: string): Promise<TagDto[]> {
	const { results } = await db
		.prepare(`SELECT * FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC`)
		.bind(userId)
		.all<TagRow>();
	return (results ?? []).map(toTagDto);
}

export async function createTag(
	db: D1Database,
	userId: string,
	name: string,
	color: string,
): Promise<TagDto> {
	const n = name.trim();
	const c = color.trim() || "hsl(210, 70%, 45%)";
	const result = await db
		.prepare(`INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)`)
		.bind(userId, n, c)
		.run();
	return { id: Number(result.meta.last_row_id), name: n, color: c };
}

export async function findOrCreateTag(
	db: D1Database,
	userId: string,
	name: string,
	color: string,
): Promise<TagDto> {
	const n = name.trim();
	const existing = await db
		.prepare(`SELECT * FROM tags WHERE user_id = ? AND name = ? LIMIT 1`)
		.bind(userId, n)
		.first<TagRow>();
	if (existing) return toTagDto(existing);
	return createTag(db, userId, n, color);
}
