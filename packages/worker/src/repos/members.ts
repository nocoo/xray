import { isSourceType, type SourceType } from "@xray/shared";
import { normalizeHandle } from "../lib/handle.js";
import type { TagDto } from "./tags.js";

export type MemberRow = {
	id: number;
	user_id: string;
	watchlist_id: number;
	source_type: string;
	external_author_id: string | null;
	handle: string;
	display_name: string | null;
	note: string | null;
	added_at_ms: number;
};

export type MemberDto = {
	id: number;
	watchlistId: number;
	sourceType: SourceType;
	externalAuthorId: string | null;
	handle: string;
	displayName: string | null;
	note: string | null;
	addedAtMs: number;
	tags: TagDto[];
};

function toMemberDto(row: MemberRow, tags: TagDto[] = []): MemberDto {
	if (!isSourceType(row.source_type)) {
		throw new Error(`invalid source_type ${row.source_type}`);
	}
	return {
		id: row.id,
		watchlistId: row.watchlist_id,
		sourceType: row.source_type,
		externalAuthorId: row.external_author_id,
		handle: row.handle,
		displayName: row.display_name,
		note: row.note,
		addedAtMs: row.added_at_ms,
		tags,
	};
}

async function loadTagsForMembers(
	db: D1Database,
	memberIds: number[],
): Promise<Map<number, TagDto[]>> {
	const map = new Map<number, TagDto[]>();
	if (memberIds.length === 0) return map;
	const placeholders = memberIds.map(() => "?").join(",");
	const { results } = await db
		.prepare(
			`SELECT j.member_id AS member_id, t.id AS id, t.name AS name, t.color AS color
       FROM watchlist_member_tags j
       JOIN tags t ON t.id = j.tag_id
       WHERE j.member_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE ASC`,
		)
		.bind(...memberIds)
		.all<{ member_id: number; id: number; name: string; color: string }>();
	for (const r of results ?? []) {
		const list = map.get(r.member_id) ?? [];
		list.push({ id: r.id, name: r.name, color: r.color });
		map.set(r.member_id, list);
	}
	return map;
}

export async function listMembers(
	db: D1Database,
	userId: string,
	watchlistId: number,
): Promise<MemberDto[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM watchlist_members
       WHERE user_id = ? AND watchlist_id = ?
       ORDER BY id ASC`,
		)
		.bind(userId, watchlistId)
		.all<MemberRow>();
	const rows = results ?? [];
	const tags = await loadTagsForMembers(
		db,
		rows.map((r) => r.id),
	);
	return rows.map((r) => toMemberDto(r, tags.get(r.id) ?? []));
}

export async function addMember(
	db: D1Database,
	userId: string,
	watchlistId: number,
	input: {
		sourceType: SourceType;
		handle: string;
		displayName?: string | null;
		note?: string | null;
		externalAuthorId?: string | null;
		tagIds?: number[];
	},
): Promise<MemberDto> {
	const handle = normalizeHandle(input.handle);
	if (!handle) throw new MemberValidationError("handle required");
	const now = Date.now();
	let result: D1Result;
	try {
		result = await db
			.prepare(
				`INSERT INTO watchlist_members
         (user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				userId,
				watchlistId,
				input.sourceType,
				input.externalAuthorId?.trim() || null,
				handle,
				input.displayName?.trim() || null,
				input.note?.trim() || null,
				now,
			)
			.run();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/UNIQUE|unique/i.test(msg)) throw new MemberConflictError("member already exists");
		throw e;
	}
	const id = Number(result.meta.last_row_id);
	if (input.tagIds?.length) {
		for (const tagId of input.tagIds) {
			await db
				.prepare(
					`INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id)
           SELECT ?, t.id FROM tags t WHERE t.id = ? AND t.user_id = ?`,
				)
				.bind(id, tagId, userId)
				.run();
		}
	}
	const row = await db
		.prepare(`SELECT * FROM watchlist_members WHERE id = ? AND user_id = ? LIMIT 1`)
		.bind(id, userId)
		.first<MemberRow>();
	if (!row) throw new Error("failed to load member");
	const tags = await loadTagsForMembers(db, [id]);
	return toMemberDto(row, tags.get(id) ?? []);
}

export async function updateMember(
	db: D1Database,
	userId: string,
	memberId: number,
	input: {
		displayName?: string | null;
		note?: string | null;
		tagIds?: number[];
	},
): Promise<MemberDto | null> {
	const row = await db
		.prepare(`SELECT * FROM watchlist_members WHERE id = ? AND user_id = ? LIMIT 1`)
		.bind(memberId, userId)
		.first<MemberRow>();
	if (!row) return null;
	const displayName =
		input.displayName !== undefined ? input.displayName?.trim() || null : row.display_name;
	const note = input.note !== undefined ? input.note?.trim() || null : row.note;
	await db
		.prepare(`UPDATE watchlist_members SET display_name = ?, note = ? WHERE id = ? AND user_id = ?`)
		.bind(displayName, note, memberId, userId)
		.run();
	if (input.tagIds) {
		await db.prepare(`DELETE FROM watchlist_member_tags WHERE member_id = ?`).bind(memberId).run();
		for (const tagId of input.tagIds) {
			await db
				.prepare(
					`INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id)
           SELECT ?, t.id FROM tags t WHERE t.id = ? AND t.user_id = ?`,
				)
				.bind(memberId, tagId, userId)
				.run();
		}
	}
	const updated = await db
		.prepare(`SELECT * FROM watchlist_members WHERE id = ? AND user_id = ? LIMIT 1`)
		.bind(memberId, userId)
		.first<MemberRow>();
	if (!updated) return null;
	const tags = await loadTagsForMembers(db, [memberId]);
	return toMemberDto(updated, tags.get(memberId) ?? []);
}

export async function deleteMember(
	db: D1Database,
	userId: string,
	memberId: number,
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM watchlist_members WHERE id = ? AND user_id = ?`)
		.bind(memberId, userId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export class MemberValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MemberValidationError";
	}
}

export class MemberConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MemberConflictError";
	}
}
