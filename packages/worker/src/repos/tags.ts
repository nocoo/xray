import type { Tag } from "@xray/shared";

export type TagRow = {
	id: number;
	user_id: string;
	name: string;
	color: string;
};

export type TagDto = Tag & { color: string };

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

export async function renameTag(db: D1Database, userId: string, id: number, name: string) {
	return db
		.prepare("UPDATE tags SET name = ? WHERE id = ? AND user_id = ? RETURNING id, name")
		.bind(name.trim(), id, userId)
		.first<Tag>();
}

export async function deleteTag(db: D1Database, userId: string, id: number) {
	const result = await db
		.prepare("DELETE FROM tags WHERE id = ? AND user_id = ?")
		.bind(id, userId)
		.run();
	return result.meta.changes > 0;
}

export async function replaceChannelTags(
	db: D1Database,
	userId: string,
	channelId: number,
	tagIds: number[],
	keyId?: number,
): Promise<Tag[] | null> {
	const table = keyId === undefined ? "channel_tags" : "channel_key_tags";
	const column = keyId === undefined ? "channel_id" : "key_id";
	const parentId = keyId ?? channelId;
	const parent =
		keyId === undefined
			? "SELECT id FROM channels WHERE id = ? AND user_id = ?"
			: "SELECT k.id FROM push_tokens k JOIN channels c ON c.id = k.channel_id WHERE k.id = ? AND k.user_id = ? AND c.user_id = ? AND c.id = ? AND k.revoked_at_ms IS NULL";
	const parentBinds =
		keyId === undefined ? [channelId, userId] : [keyId, userId, userId, channelId];
	const valid = `EXISTS (${parent}) AND (SELECT COUNT(*) FROM tags WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))) = ?`;
	const binds = [...parentBinds, userId, JSON.stringify(tagIds), tagIds.length];
	const [checked, , , listed] = await db.batch<Tag>([
		db.prepare(`SELECT 1 AS id WHERE ${valid}`).bind(...binds),
		db.prepare(`DELETE FROM ${table} WHERE ${column} = ? AND ${valid}`).bind(parentId, ...binds),
		db
			.prepare(
				`INSERT INTO ${table} (${column}, tag_id) SELECT ?, value FROM json_each(?) WHERE ${valid}`,
			)
			.bind(parentId, JSON.stringify(tagIds), ...binds),
		db
			.prepare(
				`SELECT t.id, t.name FROM tags t JOIN ${table} j ON j.tag_id = t.id WHERE j.${column} = ? AND t.user_id = ? ORDER BY t.name COLLATE NOCASE, t.id`,
			)
			.bind(parentId, userId),
	]);
	if (!checked || !listed) throw new Error("incomplete tags batch");
	return checked.results.length ? listed.results : null;
}
