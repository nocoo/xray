import { describe, expect, test } from "vitest";
import { createTag, findOrCreateTag, listTags } from "./tags.js";

function memDb() {
	const tags: Array<{ id: number; user_id: string; name: string; color: string }> = [];
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
					if (sql.includes("FROM tags") && sql.includes("AND name = ?")) {
						const [userId, name] = binds as [string, string];
						return (tags.find((t) => t.user_id === userId && t.name === name) ?? null) as T | null;
					}
					return null;
				},
				async all<T>() {
					const [userId] = binds as [string];
					return {
						results: tags.filter((t) => t.user_id === userId) as T[],
					};
				},
				async run() {
					if (sql.includes("INSERT INTO tags")) {
						const [user_id, name, color] = binds as [string, string, string];
						const id = seq++;
						tags.push({ id, user_id, name, color });
						return { meta: { changes: 1, last_row_id: id } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("tags repo", () => {
	test("create list findOrCreate", async () => {
		const db = memDb();
		const t = await createTag(db, "u1", "AI", "hsl(0,70%,45%)");
		expect(t.name).toBe("AI");
		expect(await listTags(db, "u1")).toHaveLength(1);
		const again = await findOrCreateTag(db, "u1", "AI", "hsl(0,70%,45%)");
		expect(again.id).toBe(t.id);
	});
});
