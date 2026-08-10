import { describe, expect, test } from "vitest";
import {
	addGroupMember,
	createGroup,
	deleteGroup,
	deleteGroupMember,
	getGroup,
	listGroupMembers,
	listGroups,
	updateGroup,
} from "./groups.js";

function memDb() {
	const groups: Array<Record<string, unknown>> = [];
	const members: Array<Record<string, unknown>> = [];
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
					if (sql.includes("FROM groups g") && sql.includes("AND g.id = ?")) {
						const [userId, id] = binds as [string, number];
						const g = groups.find((x) => x.user_id === userId && x.id === id);
						if (!g) return null;
						return {
							...g,
							member_count: members.filter((m) => m.group_id === id).length,
						} as T;
					}
					if (sql.includes("FROM group_members WHERE id = ?")) {
						const [id, userId] = binds as [number, string];
						return (members.find((m) => m.id === id && m.user_id === userId) ?? null) as T | null;
					}
					return null;
				},
				async all<T>() {
					if (sql.includes("FROM groups g")) {
						const [userId] = binds as [string];
						return {
							results: groups
								.filter((g) => g.user_id === userId)
								.map((g) => ({
									...g,
									member_count: members.filter((m) => m.group_id === g.id).length,
								})) as T[],
						};
					}
					if (sql.includes("FROM group_members")) {
						const [userId, groupId] = binds as [string, number];
						return {
							results: members.filter((m) => m.user_id === userId && m.group_id === groupId) as T[],
						};
					}
					return { results: [] as T[] };
				},
				async run() {
					if (sql.includes("INSERT INTO groups")) {
						const [user_id, name, description, icon, created_at_ms] = binds as [
							string,
							string,
							string | null,
							string,
							number,
						];
						const id = seq++;
						groups.push({ id, user_id, name, description, icon, created_at_ms });
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.includes("UPDATE groups")) {
						const [name, description, icon, userId, id] = binds as [
							string,
							string | null,
							string,
							string,
							number,
						];
						const g = groups.find((x) => x.id === id && x.user_id === userId);
						if (g) {
							g.name = name;
							g.description = description;
							g.icon = icon;
						}
						return { meta: { changes: g ? 1 : 0 } };
					}
					if (sql.includes("DELETE FROM groups")) {
						const [userId, id] = binds as [string, number];
						const before = groups.length;
						const next = groups.filter((g) => !(g.user_id === userId && g.id === id));
						groups.length = 0;
						groups.push(...next);
						return { meta: { changes: before - groups.length } };
					}
					if (sql.includes("INSERT INTO group_members")) {
						const [
							user_id,
							group_id,
							source_type,
							external_author_id,
							handle,
							display_name,
							added_at_ms,
						] = binds as [string, number, string, string | null, string, string | null, number];
						const id = seq++;
						members.push({
							id,
							user_id,
							group_id,
							source_type,
							external_author_id,
							handle,
							display_name,
							added_at_ms,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.includes("DELETE FROM group_members")) {
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

describe("groups repo", () => {
	test("crud + members", async () => {
		const db = memDb();
		const g = await createGroup(db, "u1", { name: "Core" });
		expect((await listGroups(db, "u1"))[0]?.name).toBe("Core");
		await updateGroup(db, "u1", g.id, { name: "Core2" });
		expect((await getGroup(db, "u1", g.id))?.name).toBe("Core2");
		const m = await addGroupMember(db, "u1", g.id, {
			sourceType: "custom",
			handle: "Hermes",
		});
		expect(m.handle).toBe("hermes");
		expect(await listGroupMembers(db, "u1", g.id)).toHaveLength(1);
		expect(await deleteGroupMember(db, "u1", m.id)).toBe(true);
		expect(await deleteGroup(db, "u1", g.id)).toBe(true);
	});
});
