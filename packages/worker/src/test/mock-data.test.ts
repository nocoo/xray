import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createSqliteD1 } from "./sqlite-d1";

test("mock seed populates both sources and preserves edits on repeated startup", async () => {
	const db = createSqliteD1();
	const seed = readFileSync(new URL("../../../../scripts/mock-data.sql", import.meta.url), "utf8");
	await db.exec(seed);
	await db.prepare("UPDATE watchlists SET name = 'Edited locally' WHERE id = 1").run();
	await db.exec(seed);
	expect(await db.prepare("SELECT COUNT(*) AS count FROM users").first()).toEqual({ count: 1 });
	expect(await db.prepare("SELECT COUNT(*) AS count FROM items").first()).toEqual({ count: 28 });
	expect(await db.prepare("SELECT name FROM watchlists WHERE id = 1").first()).toEqual({
		name: "Edited locally",
	});
	const sources = await db
		.prepare("SELECT DISTINCT source_type FROM items ORDER BY source_type")
		.all();
	expect(sources.results).toEqual([{ source_type: "custom" }, { source_type: "x.com" }]);
	expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
