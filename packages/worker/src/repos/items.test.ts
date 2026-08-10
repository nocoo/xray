import { describe, expect, test } from "vitest";
import { deleteItem, insertItemIgnore, listItems } from "./items.js";

function memDb() {
	const items: Array<Record<string, unknown>> = [];
	let seq = 1;
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async all<T>() {
					// simplified: return all items for user/wl
					const userId = binds[0] as string;
					const wl = binds[1] as number;
					let rows = items.filter((i) => i.user_id === userId && i.watchlist_id === wl);
					if (sql.includes("source_type = ?")) {
						const st = binds[2] as string;
						rows = rows.filter((i) => i.source_type === st);
					}
					rows = [...rows].sort((a, b) => Number(b.created_at_ms) - Number(a.created_at_ms));
					const limit = Number(binds[binds.length - 1]);
					return { results: rows.slice(0, limit) as T[] };
				},
				async run() {
					if (sql.includes("INSERT INTO items")) {
						const [
							user_id,
							watchlist_id,
							source_type,
							external_id,
							member_id,
							author_username,
							title,
							text,
							created_at_ms,
							ingested_at_ms,
							payload_json,
						] = binds as [
							string,
							number,
							string,
							string,
							number | null,
							string | null,
							string | null,
							string,
							number,
							number,
							string,
						];
						if (
							items.some(
								(i) =>
									i.watchlist_id === watchlist_id &&
									i.source_type === source_type &&
									i.external_id === external_id,
							)
						) {
							throw new Error("UNIQUE");
						}
						const id = seq++;
						items.push({
							id,
							user_id,
							watchlist_id,
							source_type,
							external_id,
							member_id,
							author_username,
							title,
							text,
							created_at_ms,
							ingested_at_ms,
							payload_json,
							ai_status: "not_requested",
							ai_status_updated_at_ms: 0,
							translated_text: null,
							summary_text: null,
							translation_error: null,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.includes("DELETE FROM items")) {
						const [id, userId] = binds as [number, string];
						const before = items.length;
						const next = items.filter((i) => !(i.id === id && i.user_id === userId));
						items.length = 0;
						items.push(...next);
						return { meta: { changes: before - items.length } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("items repo", () => {
	test("insert dedupe list delete", async () => {
		const db = memDb();
		expect(
			await insertItemIgnore(db, "u1", {
				watchlistId: 1,
				sourceType: "custom",
				externalId: "a1",
				text: "hello",
				createdAtMs: Date.now(),
				payload: { source_type: "custom" },
			}),
		).toBe("accepted");
		expect(
			await insertItemIgnore(db, "u1", {
				watchlistId: 1,
				sourceType: "custom",
				externalId: "a1",
				text: "hello",
				createdAtMs: Date.now(),
				payload: {},
			}),
		).toBe("deduped");
		const { items } = await listItems(db, "u1", 1, { limit: 10 });
		expect(items).toHaveLength(1);
		expect(items[0]?.sourceType).toBe("custom");
		const itemId = items[0]?.id;
		expect(itemId).toBeTypeOf("number");
		expect(await deleteItem(db, "u1", itemId as number)).toBe(true);
	});
});
