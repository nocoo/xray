import { isSourceType, type SourceType } from "@xray/shared";
import { normalizeHandle } from "../lib/handle.js";

export type GroupRow = {
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	icon: string;
	created_at_ms: number;
	member_count?: number;
};

export type GroupDto = {
	id: number;
	name: string;
	description: string | null;
	icon: string;
	createdAtMs: number;
	memberCount: number;
};

export type GroupMemberRow = {
	id: number;
	user_id: string;
	group_id: number;
	source_type: string;
	external_author_id: string | null;
	handle: string;
	display_name: string | null;
	added_at_ms: number;
};

export type GroupMemberDto = {
	id: number;
	groupId: number;
	sourceType: SourceType;
	externalAuthorId: string | null;
	handle: string;
	displayName: string | null;
	addedAtMs: number;
};

function toGroupDto(row: GroupRow): GroupDto {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		icon: row.icon,
		createdAtMs: row.created_at_ms,
		memberCount: row.member_count ?? 0,
	};
}

function toGroupMemberDto(row: GroupMemberRow): GroupMemberDto {
	if (!isSourceType(row.source_type)) throw new Error("invalid source_type");
	return {
		id: row.id,
		groupId: row.group_id,
		sourceType: row.source_type,
		externalAuthorId: row.external_author_id,
		handle: row.handle,
		displayName: row.display_name,
		addedAtMs: row.added_at_ms,
	};
}

export async function listGroups(db: D1Database, userId: string): Promise<GroupDto[]> {
	const { results } = await db
		.prepare(
			`SELECT g.*,
        (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
       FROM groups g WHERE g.user_id = ? ORDER BY g.id ASC`,
		)
		.bind(userId)
		.all<GroupRow>();
	return (results ?? []).map(toGroupDto);
}

export async function getGroup(
	db: D1Database,
	userId: string,
	id: number,
): Promise<GroupDto | null> {
	const row = await db
		.prepare(
			`SELECT g.*,
        (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
       FROM groups g WHERE g.user_id = ? AND g.id = ? LIMIT 1`,
		)
		.bind(userId, id)
		.first<GroupRow>();
	return row ? toGroupDto(row) : null;
}

export async function createGroup(
	db: D1Database,
	userId: string,
	input: { name: string; description?: string | null; icon?: string },
): Promise<GroupDto> {
	const now = Date.now();
	const result = await db
		.prepare(
			`INSERT INTO groups (user_id, name, description, icon, created_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(
			userId,
			input.name.trim(),
			input.description?.trim() || null,
			(input.icon?.trim() || "users").slice(0, 64),
			now,
		)
		.run();
	const id = Number(result.meta.last_row_id);
	const g = await getGroup(db, userId, id);
	if (!g) throw new Error("failed to load group");
	return g;
}

export async function updateGroup(
	db: D1Database,
	userId: string,
	id: number,
	input: { name?: string; description?: string | null; icon?: string },
): Promise<GroupDto | null> {
	const existing = await getGroup(db, userId, id);
	if (!existing) return null;
	await db
		.prepare(
			`UPDATE groups SET name = ?, description = ?, icon = ?
       WHERE user_id = ? AND id = ?`,
		)
		.bind(
			input.name !== undefined ? input.name.trim() : existing.name,
			input.description !== undefined ? input.description?.trim() || null : existing.description,
			input.icon !== undefined ? input.icon.trim().slice(0, 64) || "users" : existing.icon,
			userId,
			id,
		)
		.run();
	return getGroup(db, userId, id);
}

export async function deleteGroup(db: D1Database, userId: string, id: number): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM groups WHERE user_id = ? AND id = ?`)
		.bind(userId, id)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function listGroupMembers(
	db: D1Database,
	userId: string,
	groupId: number,
): Promise<GroupMemberDto[]> {
	const { results } = await db
		.prepare(`SELECT * FROM group_members WHERE user_id = ? AND group_id = ? ORDER BY id ASC`)
		.bind(userId, groupId)
		.all<GroupMemberRow>();
	return (results ?? []).map(toGroupMemberDto);
}

export async function addGroupMember(
	db: D1Database,
	userId: string,
	groupId: number,
	input: {
		sourceType: SourceType;
		handle: string;
		displayName?: string | null;
		externalAuthorId?: string | null;
	},
): Promise<GroupMemberDto> {
	const handle = normalizeHandle(input.handle);
	if (!handle) throw new Error("handle required");
	const now = Date.now();
	const result = await db
		.prepare(
			`INSERT INTO group_members
       (user_id, group_id, source_type, external_author_id, handle, display_name, added_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			userId,
			groupId,
			input.sourceType,
			input.externalAuthorId?.trim() || null,
			handle,
			input.displayName?.trim() || null,
			now,
		)
		.run();
	const id = Number(result.meta.last_row_id);
	const row = await db
		.prepare(`SELECT * FROM group_members WHERE id = ? AND user_id = ? LIMIT 1`)
		.bind(id, userId)
		.first<GroupMemberRow>();
	if (!row) throw new Error("failed to load group member");
	return toGroupMemberDto(row);
}

export async function deleteGroupMember(
	db: D1Database,
	userId: string,
	memberId: number,
	opts?: { groupId?: number },
): Promise<boolean> {
	const result = await db
		.prepare(
			opts?.groupId != null
				? `DELETE FROM group_members WHERE id = ? AND user_id = ? AND group_id = ?`
				: `DELETE FROM group_members WHERE id = ? AND user_id = ?`,
		)
		.bind(...(opts?.groupId != null ? [memberId, userId, opts.groupId] : [memberId, userId]))
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export type BulkImportResult = {
	added: number;
	skipped: number;
	total: number;
};

/**
 * Multi-row INSERT sizes stay under D1’s ~100 bind parameters per statement.
 * - import: 6 binds/row → 15 rows = 90
 * - selected copy: 7 binds/row → 14 rows = 98
 * Chunks run in a single db.batch() so Free-tier query count stays low.
 */
export const GROUP_BULK_ROWS_PER_STMT = 15;
/** Selected-member copy VALUES clause uses 7 placeholders per row. */
export const GROUP_COPY_ROWS_PER_STMT = 14;
export const GROUP_COPY_MAX = 500;

export class GroupCopyLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GroupCopyLimitError";
	}
}

type Seed = {
	handle: string;
	externalAuthorId?: string | null;
	displayName?: string | null;
};

/** Idempotent bulk add via multi-row INSERT OR IGNORE (few D1 statements). */
export async function bulkImportGroupMembers(
	db: D1Database,
	userId: string,
	groupId: number,
	seeds: Seed[],
): Promise<BulkImportResult> {
	const g = await getGroup(db, userId, groupId);
	if (!g) throw new GroupNotFoundError();
	let added = 0;
	let skipped = 0;
	const now = Date.now();
	const rows: Array<{
		handle: string;
		externalAuthorId: string | null;
		displayName: string | null;
	}> = [];
	for (const s of seeds) {
		const handle = normalizeHandle(s.handle);
		if (!handle) {
			skipped += 1;
			continue;
		}
		rows.push({
			handle,
			externalAuthorId: s.externalAuthorId?.trim() || null,
			displayName: s.displayName?.trim() || null,
		});
	}
	const stmts: D1PreparedStatement[] = [];
	const chunkSizes: number[] = [];
	for (let i = 0; i < rows.length; i += GROUP_BULK_ROWS_PER_STMT) {
		const chunk = rows.slice(i, i + GROUP_BULK_ROWS_PER_STMT);
		chunkSizes.push(chunk.length);
		const ph = chunk.map(() => "(?, ?, 'x.com', ?, ?, ?, ?)").join(", ");
		const binds: unknown[] = [];
		for (const r of chunk) {
			binds.push(userId, groupId, r.externalAuthorId, r.handle, r.displayName, now);
		}
		stmts.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO group_members
           (user_id, group_id, source_type, external_author_id, handle, display_name, added_at_ms)
           VALUES ${ph}`,
				)
				.bind(...binds),
		);
	}
	if (stmts.length) {
		const results = await db.batch(stmts);
		for (let i = 0; i < results.length; i++) {
			const ch = results[i]?.meta?.changes ?? 0;
			const sz = chunkSizes[i] ?? 0;
			added += ch;
			skipped += sz - ch;
		}
	}
	return { added, skipped, total: seeds.length };
}

export class GroupNotFoundError extends Error {
	constructor() {
		super("group not found");
		this.name = "GroupNotFoundError";
	}
}

export type CopyToWatchlistResult = {
	added: number;
	skipped: number;
	total: number;
};

/**
 * Copy group members into a watchlist (same user).
 * `memberIds` omitted → all members; `memberIds: []` → copy none (not “all”).
 */
export async function copyGroupMembersToWatchlist(
	db: D1Database,
	userId: string,
	groupId: number,
	watchlistId: number,
	opts?: { memberIds?: number[] },
): Promise<CopyToWatchlistResult> {
	const g = await getGroup(db, userId, groupId);
	if (!g) throw new GroupNotFoundError();
	const wl = await db
		.prepare(`SELECT id FROM watchlists WHERE user_id = ? AND id = ? LIMIT 1`)
		.bind(userId, watchlistId)
		.first<{ id: number }>();
	if (!wl) throw new WatchlistNotFoundError();

	const now = Date.now();

	// Full copy: single INSERT…SELECT (1 query) when no memberIds filter
	if (opts?.memberIds === undefined) {
		const before = await db
			.prepare(`SELECT COUNT(*) AS c FROM group_members WHERE user_id = ? AND group_id = ?`)
			.bind(userId, groupId)
			.first<{ c: number }>();
		const total = Number(before?.c ?? 0);
		if (total > GROUP_COPY_MAX) {
			throw new GroupCopyLimitError(`group has ${total} members; copy max is ${GROUP_COPY_MAX}`);
		}
		if (total === 0) return { added: 0, skipped: 0, total: 0 };
		const result = await db
			.prepare(
				`INSERT OR IGNORE INTO watchlist_members
         (user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms)
         SELECT user_id, ?, source_type, external_author_id, handle, display_name, NULL, ?
         FROM group_members
         WHERE user_id = ? AND group_id = ?`,
			)
			.bind(watchlistId, now, userId, groupId)
			.run();
		const added = result.meta?.changes ?? 0;
		return { added, skipped: total - added, total };
	}

	let members = await listGroupMembers(db, userId, groupId);
	const want = new Set(opts.memberIds);
	members = members.filter((m) => want.has(m.id));
	if (!members.length) return { added: 0, skipped: 0, total: 0 };
	if (members.length > GROUP_COPY_MAX) {
		throw new GroupCopyLimitError(`memberIds exceeds ${GROUP_COPY_MAX}`);
	}

	let added = 0;
	let skipped = 0;
	const rows = members.filter((m) => normalizeHandle(m.handle) && isSourceType(m.sourceType));
	skipped += members.length - rows.length;
	const stmts: D1PreparedStatement[] = [];
	const chunkSizes: number[] = [];
	for (let i = 0; i < rows.length; i += GROUP_COPY_ROWS_PER_STMT) {
		const chunk = rows.slice(i, i + GROUP_COPY_ROWS_PER_STMT);
		chunkSizes.push(chunk.length);
		// 7 binds/row; keep chunk ≤ GROUP_COPY_ROWS_PER_STMT (14 → 98 binds)
		const ph = chunk.map(() => "(?, ?, ?, ?, ?, ?, NULL, ?)").join(", ");
		const binds: unknown[] = [];
		for (const m of chunk) {
			binds.push(
				userId,
				watchlistId,
				m.sourceType,
				m.externalAuthorId,
				normalizeHandle(m.handle),
				m.displayName,
				now,
			);
		}
		stmts.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO watchlist_members
           (user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms)
           VALUES ${ph}`,
				)
				.bind(...binds),
		);
	}
	if (stmts.length) {
		const results = await db.batch(stmts);
		for (let i = 0; i < results.length; i++) {
			const ch = results[i]?.meta?.changes ?? 0;
			const sz = chunkSizes[i] ?? 0;
			added += ch;
			skipped += sz - ch;
		}
	}
	return { added, skipped, total: members.length };
}

export class WatchlistNotFoundError extends Error {
	constructor() {
		super("watchlist not found");
		this.name = "WatchlistNotFoundError";
	}
}
