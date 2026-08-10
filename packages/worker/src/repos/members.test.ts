import { describe, expect, test } from "vitest";
import {
	addMember,
	deleteMember,
	listMembers,
	MemberConflictError,
	updateMember,
} from "./members.js";

function memDb() {
	const members: Array<Record<string, unknown>> = [];
	const tags: Array<{ id: number; user_id: string; name: string; color: string }> = [
		{ id: 1, user_id: "u1", name: "AI", color: "red" },
	];
	const memberTags: Array<{ member_id: number; tag_id: number }> = [];
	let seq = 1;
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("FROM watchlist_members WHERE id = ?")) {
						const [id, userId] = binds as [number, string];
						return (members.find((m) => m.id === id && m.user_id === userId) ?? null) as T | null;
					}
					return null;
				},
				async all<T>() {
					if (sql.includes("FROM watchlist_members")) {
						const [userId, wl] = binds as [string, number];
						return {
							results: members.filter((m) => m.user_id === userId && m.watchlist_id === wl) as T[],
						};
					}
					if (sql.includes("watchlist_member_tags")) {
						const ids = binds as number[];
						const results = memberTags
							.filter((j) => ids.includes(j.member_id))
							.map((j) => {
								const t = tags.find((x) => x.id === j.tag_id);
								return {
									member_id: j.member_id,
									id: t?.id,
									name: t?.name,
									color: t?.color,
								};
							});
						return { results: results as T[] };
					}
					return { results: [] as T[] };
				},
				async run() {
					if (sql.includes("INSERT INTO watchlist_members")) {
						const [
							user_id,
							watchlist_id,
							source_type,
							external_author_id,
							handle,
							display_name,
							note,
							added_at_ms,
						] = binds as [
							string,
							number,
							string,
							string | null,
							string,
							string | null,
							string | null,
							number,
						];
						if (
							members.some(
								(m) =>
									m.watchlist_id === watchlist_id &&
									m.source_type === source_type &&
									m.handle === handle,
							)
						) {
							throw new Error("UNIQUE constraint failed");
						}
						const id = seq++;
						members.push({
							id,
							user_id,
							watchlist_id,
							source_type,
							external_author_id,
							handle,
							display_name,
							note,
							added_at_ms,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.includes("UPDATE watchlist_members")) {
						const [display_name, note, id, userId] = binds as [
							string | null,
							string | null,
							number,
							string,
						];
						const m = members.find((x) => x.id === id && x.user_id === userId);
						if (m) {
							m.display_name = display_name;
							m.note = note;
						}
						return { meta: { changes: m ? 1 : 0 } };
					}
					if (sql.includes("DELETE FROM watchlist_member_tags")) {
						const [memberId] = binds as [number];
						for (let i = memberTags.length - 1; i >= 0; i--) {
							if (memberTags[i]?.member_id === memberId) memberTags.splice(i, 1);
						}
						return { meta: { changes: 1 } };
					}
					if (sql.includes("INSERT OR IGNORE INTO watchlist_member_tags")) {
						const [memberId, tagId, userId] = binds as [number, number, string];
						if (tags.some((t) => t.id === tagId && t.user_id === userId)) {
							memberTags.push({ member_id: memberId, tag_id: tagId });
						}
						return { meta: { changes: 1 } };
					}
					if (sql.includes("DELETE FROM watchlist_members")) {
						const [id, userId] = binds as [number, string];
						const before = members.length;
						const next = members.filter((m) => !(m.id === id && m.user_id === userId));
						members.length = 0;
						members.push(...next);
						return { meta: { changes: before - members.length } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("members repo", () => {
	test("add list update delete + conflict", async () => {
		const db = memDb();
		const m = await addMember(db, "u1", 1, {
			sourceType: "x.com",
			handle: "@KarPathy",
			tagIds: [1],
		});
		expect(m.handle).toBe("karpathy");
		expect(m.tags[0]?.name).toBe("AI");

		await expect(
			addMember(db, "u1", 1, { sourceType: "x.com", handle: "karpathy" }),
		).rejects.toBeInstanceOf(MemberConflictError);

		const updated = await updateMember(db, "u1", m.id, { note: "hi", tagIds: [] });
		expect(updated?.note).toBe("hi");

		const list = await listMembers(db, "u1", 1);
		expect(list).toHaveLength(1);
		expect(await deleteMember(db, "u1", m.id)).toBe(true);
	});
});
