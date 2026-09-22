import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { createSqliteD1 } from "./sqlite-d1";

const seed = readFileSync(new URL("../../../../scripts/mock-data.sql", import.meta.url), "utf8");

async function snapshot(db: D1Database) {
	const tables = [
		"users",
		"watchlists",
		"items",
		"channels",
		"tags",
		"push_tokens",
		"channel_articles",
		"channel_tags",
		"channel_key_tags",
	];
	return Promise.all(
		tables.map(
			async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results,
		),
	);
}

test("mock catalog covers 14 channels, 45 tags and 140 varied reports with safe named sources", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	for (const [table, count] of [
		["users", 1],
		["items", 28],
		["channels", 14],
		["tags", 45],
		["channel_articles", 140],
		["push_tokens", 50],
	] as const) {
		expect(await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).toEqual({ count });
	}
	expect(
		(await db.prepare("SELECT DISTINCT source_type FROM items ORDER BY source_type").all()).results,
	).toEqual([{ source_type: "custom" }, { source_type: "x.com" }]);
	const counts = (
		await db
			.prepare(
				"SELECT c.id,COUNT(a.id) AS count FROM channels c LEFT JOIN channel_articles a ON a.channel_id=c.id GROUP BY c.id ORDER BY c.id",
			)
			.all<{ id: number; count: number }>()
	).results;
	expect(counts).toHaveLength(14);
	expect(counts.every((row) => row.count >= 8)).toBe(true);
	expect(counts[0]).toEqual({ id: 1, count: 33 });
	expect(
		await db
			.prepare("SELECT COUNT(*) AS count FROM push_tokens WHERE revoked_at_ms IS NULL")
			.first(),
	).toEqual({ count: 33 });
	expect(
		await db
			.prepare("SELECT COUNT(*) AS count FROM push_tokens WHERE revoked_at_ms IS NOT NULL")
			.first(),
	).toEqual({ count: 17 });
	expect(
		(
			await db
				.prepare(
					"SELECT channel_id FROM push_tokens GROUP BY channel_id HAVING COUNT(*) < 3 OR COUNT(DISTINCT label) < 3",
				)
				.all()
		).results,
	).toEqual([]);
	expect(
		(
			await db
				.prepare(
					"SELECT id FROM push_tokens WHERE id>=910101 AND token_hash <> 'mock-only:not-a-sha256:' || id",
				)
				.all()
		).results,
	).toEqual([]);
	expect(
		await db
			.prepare(
				"SELECT external_id FROM channel_articles WHERE channel_id=1 ORDER BY report_date DESC,id DESC LIMIT 1",
			)
			.first(),
	).toEqual({ external_id: "mock-reader-showcase-v1" });
	expect(
		await db.prepare("SELECT COUNT(*) AS count FROM channel_tags WHERE channel_id=910102").first(),
	).toEqual({ count: 0 });
	expect(
		await db
			.prepare(
				"SELECT COUNT(*) AS count FROM channel_key_tags t JOIN push_tokens k ON k.id=t.key_id WHERE k.channel_id=910102",
			)
			.first(),
	).toEqual({ count: 0 });
	expect(
		(
			await db
				.prepare(
					"SELECT c.channel_id FROM channel_tags c JOIN push_tokens k ON k.channel_id=c.channel_id JOIN channel_key_tags t ON t.key_id=k.id AND t.tag_id=c.tag_id",
				)
				.all()
		).results.length,
	).toBeGreaterThan(1);
	expect(
		await db.prepare("SELECT COUNT(DISTINCT markdown) AS count FROM channel_articles").first(),
	).toEqual({ count: 134 });
	expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
	const original = await snapshot(db);
	await db.exec(seed);
	expect(await snapshot(db)).toEqual(original);
});

test("repeated imports preserve edited fixtures and user-created resources", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	await db.exec(`
 UPDATE watchlists SET name='Edited locally' WHERE id=1;
 UPDATE channels SET name='Personal notes',description='My description' WHERE id=1;
 UPDATE channel_articles SET title='My revised title',markdown='My draft' WHERE id=950000;
 UPDATE tags SET name='My research label' WHERE name='研发';
 UPDATE push_tokens SET label='My named producer' WHERE id=930000;
 INSERT INTO channels (id,user_id,name,description,created_at_ms) VALUES (980001,'xray-mock-user','User channel','Keep me',1);
 INSERT INTO tags (user_id,name,color) VALUES ('xray-mock-user','My own tag','#abcdef');
 `);
	await db.exec(seed);
	expect(await db.prepare("SELECT name FROM watchlists WHERE id=1").first()).toEqual({
		name: "Edited locally",
	});
	expect(await db.prepare("SELECT name,description FROM channels WHERE id=1").first()).toEqual({
		name: "Personal notes",
		description: "My description",
	});
	expect(
		await db.prepare("SELECT title,markdown FROM channel_articles WHERE id=950000").first(),
	).toEqual({ title: "My revised title", markdown: "My draft" });
	expect(
		await db.prepare("SELECT COUNT(*) AS count FROM tags WHERE name='My research label'").first(),
	).toEqual({ count: 1 });
	expect(await db.prepare("SELECT label FROM push_tokens WHERE id=930000").first()).toEqual({
		label: "My named producer",
	});
	expect(await db.prepare("SELECT description FROM channels WHERE id=980001").first()).toEqual({
		description: "Keep me",
	});
	expect(await db.prepare("SELECT color FROM tags WHERE name='My own tag'").first()).toEqual({
		color: "#abcdef",
	});
	const afterImport = await snapshot(db);
	await db.exec(seed);
	expect(await snapshot(db)).toEqual(afterImport);
});

test("reserved channel and token ID collisions never attach demo records to unrelated resources", async () => {
	const db = createSqliteD1();
	await db.exec(`
 INSERT INTO users (id,access_iss,access_sub,email,name,created_at_ms) VALUES ('other-user','https://other.test','sub','other@test.local','Other',1);
 INSERT INTO channels (id,user_id,name,created_at_ms) VALUES (920101,'other-user','Private channel',1),(980001,'other-user','Other private channel',1);
 INSERT INTO push_tokens (id,user_id,channel_id,token_prefix,token_hash,label,scopes,created_at_ms) VALUES (930060,'other-user',980001,'private','private-placeholder','Private producer','[]',1);
 `);
	await db.exec(seed);
	expect(
		(await db.prepare("SELECT * FROM channel_articles WHERE channel_id IN (920101,980001)").all())
			.results,
	).toEqual([]);
	expect(
		(await db.prepare("SELECT * FROM channel_tags WHERE channel_id IN (920101,980001)").all())
			.results,
	).toEqual([]);
	expect(
		(await db.prepare("SELECT * FROM channel_key_tags WHERE key_id=930060").all()).results,
	).toEqual([]);
	expect(await db.prepare("SELECT user_id,name FROM channels WHERE id=920101").first()).toEqual({
		user_id: "other-user",
		name: "Private channel",
	});
	expect(await db.prepare("SELECT user_id,label FROM push_tokens WHERE id=930060").first()).toEqual(
		{ user_id: "other-user", label: "Private producer" },
	);
	expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

test("only the unchanged former empty-channel fixture is renamed", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	await db.exec(
		"UPDATE channels SET name='等待第一篇报告',description='Mock · 空频道，展示首次投递前的状态。' WHERE id=910103",
	);
	await db.exec(seed);
	expect(await db.prepare("SELECT name,description FROM channels WHERE id=910103").first()).toEqual(
		{ name: "灵感备忘", description: "Mock · 捕捉尚未成形的想法与小实验。" },
	);
	await db.exec(
		"UPDATE channels SET name='等待第一篇报告',description='My edited description' WHERE id=910103",
	);
	await db.exec(seed);
	expect(await db.prepare("SELECT name,description FROM channels WHERE id=910103").first()).toEqual(
		{ name: "等待第一篇报告", description: "My edited description" },
	);
});

test("D1 import stays below 90 KiB total and 64 KiB per SQLite-parsed statement", () => {
	expect(Buffer.byteLength(seed, "utf8")).toBeLessThan(90 * 1024);
	const db = new DatabaseSync(":memory:");
	try {
		const migrations = new URL("../../migrations/", import.meta.url);
		for (const file of readdirSync(migrations)
			.filter((name) => name.endsWith(".sql"))
			.sort()) {
			db.exec(readFileSync(new URL(file, migrations), "utf8"));
		}
		let remaining = seed;
		while (remaining.trim()) {
			const statement = db.prepare(remaining).sourceSQL;
			expect(statement.length).toBeGreaterThan(0);
			expect(Buffer.byteLength(statement, "utf8")).toBeLessThan(64 * 1024);
			db.exec(statement);
			remaining = remaining.slice(statement.length);
		}
	} finally {
		db.close();
	}
});
