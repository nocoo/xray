import { describe, expect, test } from "vitest";
import { getSetting, getWindowHours, setSetting } from "./settings.js";

function memDb() {
	const rows = new Map<string, string>();
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("SELECT value")) {
						const [userId, key] = binds as [string, string];
						const v = rows.get(`${userId}:${key}`);
						return (v != null ? { value: v } : null) as T | null;
					}
					return null;
				},
				async run() {
					if (sql.includes("INSERT INTO settings")) {
						const [userId, key, value] = binds as [string, string, string];
						rows.set(`${userId}:${key}`, value);
					}
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("settings repo", () => {
	test("window hours default and clamp via set", async () => {
		const db = memDb();
		expect(await getWindowHours(db, "u1")).toBe(24);
		await setSetting(db, "u1", "ingest.windowHours", "48");
		expect(await getSetting(db, "u1", "ingest.windowHours")).toBe("48");
		expect(await getWindowHours(db, "u1")).toBe(48);
	});
});
