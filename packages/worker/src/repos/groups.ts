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
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM group_members WHERE id = ? AND user_id = ?`)
		.bind(memberId, userId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}
