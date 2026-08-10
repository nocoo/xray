import { isSourceType, type SourceType } from "@xray/shared";

export type ItemRow = {
	id: number;
	user_id: string;
	watchlist_id: number;
	source_type: string;
	external_id: string;
	member_id: number | null;
	author_username: string | null;
	title: string | null;
	text: string;
	created_at_ms: number;
	ingested_at_ms: number;
	payload_json: string;
	ai_status: string;
	ai_status_updated_at_ms: number;
	translated_text: string | null;
	summary_text: string | null;
	translation_error: string | null;
};

export type ItemDto = {
	id: number;
	watchlistId: number;
	sourceType: SourceType;
	externalId: string;
	memberId: number | null;
	authorUsername: string | null;
	title: string | null;
	text: string;
	createdAtMs: number;
	ingestedAtMs: number;
	payload: unknown;
	aiStatus: string;
	translatedText: string | null;
	summaryText: string | null;
	translationError: string | null;
};

function toItemDto(row: ItemRow): ItemDto {
	if (!isSourceType(row.source_type)) throw new Error("invalid source_type");
	let payload: unknown = null;
	try {
		payload = JSON.parse(row.payload_json);
	} catch {
		payload = null;
	}
	return {
		id: row.id,
		watchlistId: row.watchlist_id,
		sourceType: row.source_type,
		externalId: row.external_id,
		memberId: row.member_id,
		authorUsername: row.author_username,
		title: row.title,
		text: row.text,
		createdAtMs: row.created_at_ms,
		ingestedAtMs: row.ingested_at_ms,
		payload,
		aiStatus: row.ai_status,
		translatedText: row.translated_text,
		summaryText: row.summary_text,
		translationError: row.translation_error,
	};
}

/** Opaque cursor: base64url(created_at_ms:id) */
export function encodeItemCursor(createdAtMs: number, id: number): string {
	const raw = `${createdAtMs}:${id}`;
	return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeItemCursor(cursor: string): { createdAtMs: number; id: number } | null {
	try {
		const pad = cursor.length % 4 === 0 ? "" : "=".repeat(4 - (cursor.length % 4));
		const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/") + pad;
		const raw = atob(b64);
		const [a, b] = raw.split(":");
		const createdAtMs = Number(a);
		const id = Number(b);
		if (!Number.isFinite(createdAtMs) || !Number.isInteger(id) || id <= 0) return null;
		return { createdAtMs, id };
	} catch {
		return null;
	}
}

export async function listItems(
	db: D1Database,
	userId: string,
	watchlistId: number,
	opts: { limit?: number; cursor?: string | null; sourceType?: SourceType | null } = {},
): Promise<{ items: ItemDto[]; next_cursor: string | null }> {
	const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
	const params: unknown[] = [userId, watchlistId];
	let sql = `SELECT * FROM items WHERE user_id = ? AND watchlist_id = ?`;
	if (opts.sourceType) {
		sql += ` AND source_type = ?`;
		params.push(opts.sourceType);
	}
	if (opts.cursor) {
		const decoded = decodeItemCursor(opts.cursor);
		if (!decoded) throw new ItemCursorError("invalid cursor");
		sql += ` AND (created_at_ms < ? OR (created_at_ms = ? AND id < ?))`;
		params.push(decoded.createdAtMs, decoded.createdAtMs, decoded.id);
	}
	sql += ` ORDER BY created_at_ms DESC, id DESC LIMIT ?`;
	params.push(limit + 1);
	const { results } = await db
		.prepare(sql)
		.bind(...params)
		.all<ItemRow>();
	const rows = results ?? [];
	const hasMore = rows.length > limit;
	const slice = hasMore ? rows.slice(0, limit) : rows;
	const items = slice.map(toItemDto);
	const last = items[items.length - 1];
	const next_cursor = hasMore && last ? encodeItemCursor(last.createdAtMs, last.id) : null;
	return { items, next_cursor };
}

export async function insertItemIgnore(
	db: D1Database,
	userId: string,
	input: {
		watchlistId: number;
		sourceType: SourceType;
		externalId: string;
		memberId?: number | null;
		authorUsername?: string | null;
		title?: string | null;
		text: string;
		createdAtMs: number;
		payload: unknown;
	},
): Promise<"accepted" | "deduped"> {
	const now = Date.now();
	try {
		const result = await db
			.prepare(
				`INSERT INTO items
         (user_id, watchlist_id, source_type, external_id, member_id, author_username, title, text,
          created_at_ms, ingested_at_ms, payload_json, ai_status, ai_status_updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_requested', 0)`,
			)
			.bind(
				userId,
				input.watchlistId,
				input.sourceType,
				input.externalId,
				input.memberId ?? null,
				input.authorUsername ?? null,
				input.title ?? null,
				input.text,
				input.createdAtMs,
				now,
				JSON.stringify(input.payload ?? {}),
			)
			.run();
		return (result.meta.changes ?? 0) > 0 ? "accepted" : "deduped";
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/UNIQUE|unique/i.test(msg)) return "deduped";
		throw e;
	}
}

export async function deleteItem(db: D1Database, userId: string, itemId: number): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM items WHERE id = ? AND user_id = ?`)
		.bind(itemId, userId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export class ItemCursorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ItemCursorError";
	}
}
