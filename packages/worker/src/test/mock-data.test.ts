import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseCanonicalItem } from "@xray/shared";
import { expect, test } from "vitest";
import { createSqliteD1 } from "./sqlite-d1";

const seed = readFileSync(new URL("../../../../scripts/mock-data.sql", import.meta.url), "utf8");

async function snapshot(db: D1Database) {
	const tables = [
		"users",
		"watchlists",
		"watchlist_members",
		"watchlist_member_tags",
		"groups",
		"group_members",
		"ingest_logs",
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

test("mock catalog covers 15 channels, 45 tags and 145 varied reports with safe named sources", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	for (const [table, count] of [
		["users", 1],
		["items", 236],
		["channels", 15],
		["tags", 45],
		["channel_articles", 145],
		["push_tokens", 51],
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
	expect(counts).toHaveLength(15);
	expect(counts.find((row) => row.id === 10)).toEqual({ id: 10, count: 4 });
	expect(counts.filter((row) => row.id !== 10).every((row) => row.count >= 8)).toBe(true);
	expect(counts[0]).toEqual({ id: 1, count: 34 });
	expect(
		await db
			.prepare("SELECT COUNT(*) AS count FROM push_tokens WHERE revoked_at_ms IS NULL")
			.first(),
	).toEqual({ count: 33 });
	expect(
		await db
			.prepare("SELECT COUNT(*) AS count FROM push_tokens WHERE revoked_at_ms IS NOT NULL")
			.first(),
	).toEqual({ count: 18 });
	expect(
		(
			await db
				.prepare(
					"SELECT channel_id FROM push_tokens WHERE channel_id <> 10 GROUP BY channel_id HAVING COUNT(*) < 3 OR COUNT(DISTINCT label) < 3",
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
	).toEqual({ external_id: "mock-cjk-emphasis" });
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
	).toEqual({ count: 139 });
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

test("watchlist and group catalogs cover both source types, copy overlap and varied timeline payloads", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	for (const [table, count] of [
		["watchlists", 13],
		["watchlist_members", 108],
		["groups", 13],
		["group_members", 106],
		["items", 236],
		["ingest_logs", 59],
	] as const) {
		expect(await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).toEqual({ count });
	}
	for (const [parent, child, key] of [
		["watchlists", "watchlist_members", "watchlist_id"],
		["watchlists", "items", "watchlist_id"],
		["groups", "group_members", "group_id"],
	]) {
		expect(
			(
				await db
					.prepare(
						`SELECT p.id FROM ${parent} p LEFT JOIN ${child} c ON c.${key}=p.id GROUP BY p.id HAVING COUNT(c.id)<8 OR COUNT(DISTINCT c.source_type)<2`,
					)
					.all()
			).results,
		).toEqual([]);
	}
	expect(
		await db
			.prepare(
				"SELECT COUNT(*) AS count FROM watchlists WHERE id BETWEEN 960003 AND 960013 AND translate_enabled=0",
			)
			.first(),
	).toEqual({ count: 11 });
	expect(
		await db
			.prepare(
				"SELECT COUNT(*) AS count FROM group_members g JOIN watchlist_members w ON w.user_id=g.user_id AND w.source_type=g.source_type AND w.handle=g.handle WHERE g.id>=9600000",
			)
			.first(),
	).toEqual({ count: 78 });
	expect(
		(
			await db
				.prepare(
					"SELECT m.id FROM watchlist_members m LEFT JOIN watchlist_member_tags t ON t.member_id=m.id WHERE m.id>=9600000 GROUP BY m.id HAVING COUNT(t.tag_id)=0",
				)
				.all()
		).results.length,
	).toBeGreaterThan(0);
	expect(
		(
			await db
				.prepare(
					"SELECT member_id FROM watchlist_member_tags GROUP BY member_id HAVING COUNT(*)>=3",
				)
				.all()
		).results.length,
	).toBeGreaterThan(0);
	const rows = (
		await db
			.prepare(
				"SELECT payload_json,ai_status,translated_text,summary_text,translation_error FROM items WHERE id>=9700000",
			)
			.all<{
				payload_json: string;
				ai_status: string;
				translated_text: string | null;
				summary_text: string | null;
				translation_error: string | null;
			}>()
	).results;
	expect(rows).toHaveLength(208);
	const statuses = new Set<string>();
	const references = new Set<string>();
	const media = new Set<string>();
	let customLinks = 0,
		longItems = 0,
		reposts = 0;
	for (const row of rows) {
		statuses.add(row.ai_status);
		const parsed = parseCanonicalItem(JSON.parse(row.payload_json));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error(parsed.message);
		const item = parsed.value;
		if (item.source_type === "custom") {
			if (item.body.url) customLinks++;
			if (item.body.text.length > 700) longItems++;
		} else {
			for (const reference of item.body.tweet.referenced_tweets ?? [])
				references.add(reference.type);
			for (const attachment of item.body.includes?.media ?? []) media.add(attachment.type);
			if (item.meta?.is_retweet === true) reposts++;
		}
		if (row.ai_status === "succeeded") {
			expect(row.translated_text).toBeTruthy();
			expect(row.summary_text).toBeTruthy();
		} else {
			expect(row.translated_text).toBeNull();
			expect(row.summary_text).toBeNull();
		}
		expect(row.translation_error !== null).toBe(row.ai_status === "failed");
	}
	expect([...statuses].sort()).toEqual(["failed", "not_requested", "pending", "succeeded"]);
	expect([...references].sort()).toEqual(["quoted", "replied_to"]);
	expect([...media].sort()).toEqual(["animated_gif", "photo", "video"]);
	expect(customLinks).toBe(104);
	expect(longItems).toBe(26);
	expect(reposts).toBe(26);
	expect(
		(
			await db
				.prepare("SELECT id FROM ingest_logs WHERE attempted<>accepted+deduped+rejected")
				.all()
		).results,
	).toEqual([]);
	expect(
		(await db.prepare("SELECT DISTINCT rejected FROM ingest_logs ORDER BY rejected").all()).results,
	).toEqual([{ rejected: 0 }, { rejected: 1 }]);
});

test("watchlist expansion preserves existing preferences, members and user-authored content", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	await db.exec(`
 UPDATE watchlists SET name='My custom topic',translate_enabled=1 WHERE id=960003;
 UPDATE watchlist_members SET display_name='My source name',note='Personal note' WHERE id=9600030;
 UPDATE groups SET name='My source collection',description='Personal group' WHERE id=960003;
 UPDATE group_members SET display_name='My group source' WHERE id=9600030;
 UPDATE items SET text='My corrected text',payload_json='{}' WHERE id=9700300;
 `);
	const before = await snapshot(db);
	await db.exec(seed);
	expect(await snapshot(db)).toEqual(before);
});

test("reading fixtures include both states and repeated seeding preserves progress", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	expect(
		(
			await db
				.prepare(
					"SELECT is_read, COUNT(*) AS count FROM channel_articles WHERE channel_id=10 GROUP BY is_read ORDER BY is_read",
				)
				.all()
		).results,
	).toEqual([
		{ is_read: 0, count: 3 },
		{ is_read: 1, count: 1 },
	]);
	await db.exec("UPDATE channel_articles SET is_read=1 WHERE channel_id=10");
	await db.exec(seed);
	expect(
		await db
			.prepare("SELECT COUNT(*) AS count FROM channel_articles WHERE channel_id=10 AND is_read=0")
			.first(),
	).toEqual({ count: 0 });
});
