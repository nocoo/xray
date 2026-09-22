import { readFileSync } from "node:fs";
import type { ParsedArticle } from "@xray/shared";
import { describe, expect, test } from "vitest";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import {
	createChannel,
	deleteChannel,
	getChannel,
	getChannelArticle,
	ingestChannelArticle,
	listChannelArticles,
	listChannels,
	orderChannels,
	updateChannel,
	updateChannelArticle,
} from "./channels.js";
import { createChannelKey, revokeChannelKey } from "./push-tokens.js";

import { createTag, deleteTag, renameTag, replaceChannelTags } from "./tags.js";

const U1 = "user-1";
const U2 = "user-2";

function testDb(): D1Database {
	const db = createSqliteD1();
	db.exec(
		`INSERT INTO users (id, email, created_at_ms) VALUES
		 ('${U1}', 'u1@xray.local', 1), ('${U2}', 'u2@xray.local', 1)`,
	);
	return db;
}

function article(overrides: Partial<ParsedArticle> = {}): ParsedArticle {
	return {
		externalId: "ext-1",
		title: "研报 · 2026-09-22",
		reportDate: "2026-09-22",
		markdown: "## 今日进展\n\n中文与 English。",
		summary: "A brief report",
		author: "Research Team",
		...overrides,
	};
}

async function seedChannelKey(db: D1Database, userId = U1, label = "Research Agent") {
	const channel = await createChannel(db, userId, { name: "Reports", description: "Daily" });
	const key = await createChannelKey(db, userId, channel.id, label, "aaaa1111", `hash-${label}`);
	return { channel, key };
}
describe("channels repo", () => {
	test("article tags merge live channel and source tags, deduplicate and survive edits and revocation", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db);
		const source = { keyId: key.id, label: key.label };
		const tokenTag = await createTag(db, U1, "alpha", "");
		const channelTag = await createTag(db, U1, "Alpha", "");
		const sharedTag = await createTag(db, U1, "Zulu", "");
		const tag = ({ id, name }: { id: number; name: string }) => ({ id, name });
		await replaceChannelTags(db, U1, channel.id, [sharedTag.id, channelTag.id]);
		await replaceChannelTags(db, U1, channel.id, [sharedTag.id, tokenTag.id], key.id);
		const created = await ingestChannelArticle(db, U1, channel.id, source, article());
		if (created.status !== "created") throw new Error("expected created article");
		const id = created.article.id;
		const assertTags = async (expected: { id: number; name: string }[]) => {
			const detail = await getChannelArticle(db, U1, channel.id, id);
			expect(detail?.tags).toEqual(expected);
			const page = await listChannelArticles(db, U1, channel.id, {
				date: null,
				before: null,
				limit: 30,
			});
			if (!detail) throw new Error("expected article detail");
			const { markdown: _, ...summary } = detail;
			expect(page?.items).toEqual([summary]);
			expect(JSON.stringify(detail)).not.toContain("hash-");
			expect(detail).not.toHaveProperty("source_key_id");
		};
		const merged = [tokenTag, channelTag, sharedTag].map(tag);
		expect(created.article.tags).toEqual(merged);
		expect(await ingestChannelArticle(db, U1, channel.id, source, article())).toMatchObject({
			status: "duplicate",
			article: { tags: merged },
		});
		await assertTags(merged);
		expect(
			await updateChannelArticle(db, U1, channel.id, id, article({ title: "Edited" })),
		).toMatchObject({ tags: merged, title: "Edited" });
		expect(await updateChannelArticle(db, U2, channel.id, id, article())).toBeNull();
		await replaceChannelTags(db, U1, channel.id, []);
		await assertTags([tokenTag, sharedTag].map(tag));
		await replaceChannelTags(db, U1, channel.id, [], key.id);
		await assertTags([]);
		await replaceChannelTags(db, U1, channel.id, [channelTag.id]);
		await assertTags([tag(channelTag)]);
		await replaceChannelTags(db, U1, channel.id, [tokenTag.id], key.id);
		expect(await revokeChannelKey(db, U1, channel.id, key.id)).toBe(true);
		await assertTags([tokenTag, channelTag].map(tag));
		await renameTag(db, U1, tokenTag.id, "ZZ renamed");
		await assertTags([tag(channelTag), { id: tokenTag.id, name: "ZZ renamed" }]);
		await deleteTag(db, U1, tokenTag.id);
		await assertTags([tag(channelTag)]);
		await deleteTag(db, U1, channelTag.id);
		await assertTags([]);
	});

	test("article tags reject foreign tags and mismatched source tenant or channel", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db);
		const other = await seedChannelKey(db, U2, "Other");
		const ownTag = await createTag(db, U1, "Own", "");
		const foreignTag = await createTag(db, U2, "Foreign", "");
		await db.exec(`INSERT INTO channel_tags VALUES (${channel.id}, ${foreignTag.id});
   INSERT INTO channel_key_tags VALUES (${key.id}, ${foreignTag.id}), (${other.key.id}, ${ownTag.id});`);
		const created = await ingestChannelArticle(
			db,
			U1,
			channel.id,
			{ keyId: key.id, label: key.label },
			article(),
		);
		if (created.status !== "created") throw new Error("expected created article");
		const id = created.article.id;
		expect(created.article.tags).toEqual([]);
		expect(await getChannelArticle(db, U2, channel.id, id)).toBeNull();
		expect(
			(await listChannelArticles(db, U2, channel.id, { date: null, before: null, limit: 30 }))
				?.items,
		).toEqual([]);
		await db
			.prepare("UPDATE channel_articles SET source_key_id = ? WHERE id = ?")
			.bind(other.key.id, id)
			.run();
		expect((await getChannelArticle(db, U1, channel.id, id))?.tags).toEqual([]);
		await db
			.prepare("UPDATE push_tokens SET user_id = ? WHERE id = ?")
			.bind(U1, other.key.id)
			.run();
		expect((await getChannelArticle(db, U1, channel.id, id))?.tags).toEqual([]);
		await db
			.prepare("UPDATE push_tokens SET channel_id = ? WHERE id = ?")
			.bind(channel.id, other.key.id)
			.run();
		expect((await getChannelArticle(db, U1, channel.id, id))?.tags).toEqual([
			{ id: ownTag.id, name: ownTag.name },
		]);
	});

	test("migration preserves per-tenant ID order and appends new channels", async () => {
		const db = createSqliteD1({ migrate: false });
		for (const name of [
			"0000_users.sql",
			"0001_full_schema.sql",
			"0002_quoted_translated_text.sql",
			"0003_channels.sql",
		]) {
			await db.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
		}
		await db.exec(`INSERT INTO users (id, email, created_at_ms) VALUES ('${U1}', 'one@test', 1), ('${U2}', 'two@test', 1);
   INSERT INTO channels (id, user_id, name, created_at_ms) VALUES (9, '${U1}', 'later', 1), (2, '${U1}', 'first', 9), (5, '${U2}', 'other', 1);`);
		await db.exec(
			readFileSync(
				new URL("../../migrations/0004_channel_sort_order.sql", import.meta.url),
				"utf8",
			),
		);
		await db.exec(
			readFileSync(new URL("../../migrations/0005_channel_tags.sql", import.meta.url), "utf8"),
		);
		expect((await listChannels(db, U1)).map((c) => [c.id, c.sortOrder])).toEqual([
			[2, 0],
			[9, 1],
		]);
		expect((await listChannels(db, U2))[0]?.sortOrder).toBe(0);
		expect((await createChannel(db, U1, { name: "new" })).sortOrder).toBe(2);
	});

	test("reorder validates the complete tenant set before any write", async () => {
		const db = testDb();
		expect(await orderChannels(db, U1, [])).toEqual([]);
		const a = await createChannel(db, U1, { name: "A" });
		const b = await createChannel(db, U1, { name: "B" });
		const other = await createChannel(db, U2, { name: "Other" });
		for (const ids of [
			[],
			[b.id],
			[b.id, 999],
			[b.id, other.id],
			[b.id, b.id],
			[b.id, a.id, other.id],
		]) {
			expect(await orderChannels(db, U1, ids)).toBeNull();
			expect((await listChannels(db, U1)).map((c) => [c.id, c.sortOrder])).toEqual([
				[a.id, 0],
				[b.id, 1],
			]);
		}
		expect((await orderChannels(db, U1, [b.id, a.id]))?.map((c) => [c.id, c.sortOrder])).toEqual([
			[b.id, 0],
			[a.id, 1],
		]);
		expect((await createChannel(db, U1, { name: "C" })).sortOrder).toBe(2);
		expect(await getChannel(db, U2, other.id)).toEqual(other);
		await db.prepare("UPDATE channels SET sort_order = 0 WHERE user_id = ?").bind(U1).run();
		expect((await listChannels(db, U1)).map((c) => c.id)).toEqual([a.id, b.id, other.id + 1]);
	});

	test("ordering rolls back if its result query fails", async () => {
		const db = testDb();
		const a = await createChannel(db, U1, { name: "A" });
		const b = await createChannel(db, U1, { name: "B" });
		const prepare = db.prepare.bind(db);
		const failingDb = {
			prepare(sql: string) {
				return prepare(
					sql.includes("AS article_count")
						? "SELECT abs(-9223372036854775808) WHERE ? IS NOT NULL"
						: sql,
				);
			},
			batch: db.batch.bind(db),
		} as unknown as D1Database;
		await expect(orderChannels(failingDb, U1, [b.id, a.id])).rejects.toThrow();
		expect((await listChannels(db, U1)).map((c) => c.sortOrder)).toEqual([0, 1]);
	});

	test("ordering rejects an incomplete D1 batch response", async () => {
		const db = testDb();
		db.batch = async () => [];
		await expect(orderChannels(db, U1, [])).rejects.toThrow("incomplete channel order batch");
	});
	test("single-statement ordering rolls back every row on a database failure", async () => {
		const db = testDb();
		const a = await createChannel(db, U1, { name: "A" });
		const b = await createChannel(db, U1, { name: "B" });
		await db.exec(`CREATE TRIGGER fail_order BEFORE UPDATE OF sort_order ON channels WHEN NEW.id = ${b.id}
   BEGIN SELECT RAISE(ABORT, 'order failed'); END;`);
		await expect(orderChannels(db, U1, [b.id, a.id])).rejects.toThrow("order failed");
		expect((await listChannels(db, U1)).map((c) => c.sortOrder)).toEqual([0, 1]);
	});

	test("stats distinguish report dates from receipts and exclude foreign/revoked keys", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db);
		expect(channel).toMatchObject({
			sortOrder: 0,
			activeKeyCount: 0,
			latestReportDate: null,
			lastReceivedAtMs: null,
		});
		const revoked = await createChannelKey(
			db,
			U1,
			channel.id,
			"Revoked",
			"revoked",
			"hash-revoked",
		);
		await db
			.prepare("UPDATE push_tokens SET revoked_at_ms = 1 WHERE id = ?")
			.bind(revoked.id)
			.run();
		await createChannelKey(db, U2, channel.id, "Foreign", "foreign", "hash-foreign");
		const source = { keyId: key.id, label: key.label };
		await ingestChannelArticle(
			db,
			U1,
			channel.id,
			source,
			article({ externalId: "new-date", reportDate: "2026-09-22" }),
		);
		await ingestChannelArticle(
			db,
			U1,
			channel.id,
			source,
			article({ externalId: "late", reportDate: "2025-01-01" }),
		);
		await db
			.prepare(
				"UPDATE channel_articles SET created_at_ms = CASE external_id WHEN 'late' THEN 200 ELSE 100 END",
			)
			.run();
		await ingestChannelArticle(
			db,
			U2,
			channel.id,
			source,
			article({ externalId: "foreign", reportDate: "2099-01-01" }),
		);
		const expected = {
			articleCount: 2,
			activeKeyCount: 1,
			latestReportDate: "2026-09-22",
			lastReceivedAtMs: 200,
		};
		expect(await getChannel(db, U1, channel.id)).toMatchObject(expected);
		expect((await listChannels(db, U1))[0]).toMatchObject(expected);
	});

	test("delete is scoped and cascades articles and active/revoked keys", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db);
		const other = await seedChannelKey(db, U2, "Other");
		await ingestChannelArticle(db, U1, channel.id, { keyId: key.id, label: key.label }, article());
		const revoked = await createChannelKey(db, U1, channel.id, "Revoked", "rev", "hash-rev");
		await db
			.prepare("UPDATE push_tokens SET revoked_at_ms = 1 WHERE id = ?")
			.bind(revoked.id)
			.run();
		expect(await deleteChannel(db, U2, channel.id)).toBe(false);
		expect(await getChannel(db, U1, channel.id)).not.toBeNull();
		expect(await deleteChannel(db, U1, channel.id)).toBe(true);
		expect(await deleteChannel(db, U1, channel.id)).toBe(false);
		for (const table of ["channel_articles", "push_tokens"]) {
			expect(
				await db
					.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE channel_id = ?`)
					.bind(channel.id)
					.first(),
			).toEqual({ count: 0 });
		}
		expect(await getChannel(db, U2, other.channel.id)).not.toBeNull();
	});
	test("create, list, update are tenant scoped", async () => {
		const db = testDb();
		const a = await createChannel(db, U1, { name: "Alpha", description: "first" });
		expect(a).toMatchObject({ name: "Alpha", description: "first", articleCount: 0 });
		expect(a.createdAtMs).toBeGreaterThan(0);
		await createChannel(db, U1, { name: "Beta", description: null });
		await createChannel(db, U2, { name: "Other tenant" });

		expect((await listChannels(db, U1)).map((ch) => ch.name)).toEqual(["Alpha", "Beta"]);
		expect((await listChannels(db, U2)).map((ch) => ch.name)).toEqual(["Other tenant"]);
		expect(await getChannel(db, U1, a.id)).toMatchObject({ id: a.id, name: "Alpha" });
		expect(await getChannel(db, U2, a.id)).toBeNull();

		const renamed = await updateChannel(db, U1, a.id, { name: "Alpha2", description: "  " });
		expect(renamed).toMatchObject({ name: "Alpha2", description: null });
		expect(await updateChannel(db, U2, a.id, { name: "Hijack" })).toBeNull();
		expect(await getChannel(db, U2, a.id)).toBeNull();
	});

	test("ingest is idempotent per key and conflicts on other keys or content", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db);
		const other = await createChannelKey(db, U1, channel.id, "Another", "bbbb2222", "hash-other");
		const input = article();

		const first = await ingestChannelArticle(
			db,
			U1,
			channel.id,
			{ keyId: key.id, label: key.label },
			input,
		);
		expect(first.status).toBe("created");

		const retry = await ingestChannelArticle(
			db,
			U1,
			channel.id,
			{ keyId: key.id, label: key.label },
			input,
		);
		expect(retry.status).toBe("duplicate");
		expect(retry.status === "duplicate" && retry.article.id).toBe(
			first.status === "created" ? first.article.id : 0,
		);

		for (const changed of [
			article({ markdown: "Replacement" }),
			article({ title: "Different title" }),
			article({ reportDate: "2026-09-21" }),
			article({ summary: "Different summary" }),
			article({ summary: null }),
			article({ author: "Someone else" }),
		]) {
			const r = await ingestChannelArticle(
				db,
				U1,
				channel.id,
				{ keyId: key.id, label: key.label },
				changed,
			);
			expect(r.status).toBe("conflict");
		}

		const crossKey = await ingestChannelArticle(
			db,
			U1,
			channel.id,
			{ keyId: other.id, label: other.label },
			input,
		);
		expect(crossKey.status).toBe("conflict");

		const read = await getChannelArticle(
			db,
			U1,
			channel.id,
			first.status === "created" ? first.article.id : 0,
		);
		expect(read).toMatchObject({ markdown: input.markdown, sourceLabel: "Research Agent" });
		expect(await getChannelArticle(db, U2, channel.id, 1)).toBeNull();
	});

	test("reads and counts exclude inconsistent child tenant rows", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db, U1);
		const r = await ingestChannelArticle(
			db,
			U2,
			channel.id,
			{ keyId: key.id, label: key.label },
			article(),
		);
		expect(r.status).toBe("created");
		expect(await listChannels(db, U2)).toHaveLength(0);
		expect(await getChannel(db, U1, channel.id)).toMatchObject({ articleCount: 0 });
		const page = await listChannelArticles(db, U1, channel.id, {
			date: null,
			before: null,
			limit: 30,
		});
		expect(page?.items).toHaveLength(0);
	});

	test("pagination sorts report_date DESC, id DESC with date filter and cursors", async () => {
		const db = testDb();
		const { channel, key } = await seedChannelKey(db);
		const src = { keyId: key.id, label: key.label };
		for (const [i, date] of ["2025-01-01", "2026-09-21", "2026-09-22", "2026-09-22"].entries()) {
			const r = await ingestChannelArticle(
				db,
				U1,
				channel.id,
				src,
				article({ externalId: `e${i}`, reportDate: date }),
			);
			expect(r.status).toBe("created");
		}

		const first = await listChannelArticles(db, U1, channel.id, {
			date: null,
			before: null,
			limit: 2,
		});
		expect(first?.items.map((x) => x.reportDate)).toEqual(["2026-09-22", "2026-09-22"]);
		expect(first?.items[0].id).toBeGreaterThan(first?.items[1].id ?? 0);
		expect(first?.nextCursor).toBe(first?.items[1].id);
		expect(first?.items[0]).not.toHaveProperty("markdown");

		const next = await listChannelArticles(db, U1, channel.id, {
			date: null,
			before: first?.nextCursor ?? 0,
			limit: 2,
		});
		expect(next?.items.map((x) => x.reportDate)).toEqual(["2026-09-21", "2025-01-01"]);
		expect(next?.nextCursor).toBeNull();

		const filtered = await listChannelArticles(db, U1, channel.id, {
			date: "2026-09-22",
			before: null,
			limit: 30,
		});
		expect(filtered?.items).toHaveLength(2);

		const stale = await listChannelArticles(db, U1, channel.id, {
			date: null,
			before: 9999,
			limit: 30,
		});
		expect(stale).toBeNull();

		const updated = await getChannel(db, U1, channel.id);
		expect(updated?.articleCount).toBe(4);
	});

	test("update branches and empty description normalize to null", async () => {
		const db = testDb();
		const a = await createChannel(db, U1, { name: "Alpha", description: "" });
		expect(a.description).toBeNull();
		expect((await createChannel(db, U1, { name: "NoDesc" })).description).toBeNull();

		const nameOnly = await updateChannel(db, U1, a.id, { name: "OnlyName" });
		expect(nameOnly).toMatchObject({ name: "OnlyName", description: null });
		const descOnly = await updateChannel(db, U1, a.id, { description: "OnlyDesc" });
		expect(descOnly).toMatchObject({ name: "OnlyName", description: "OnlyDesc" });
	});

	test("defensive null handling on degraded D1 responses", async () => {
		// getChannel/listChannels without article_count / null results
		const bare = stubDb({
			first: [{ id: 1, user_id: U1, name: "Bare", description: null, created_at_ms: 1 }],
			all: [null],
		});
		expect(await getChannel(bare, U1, 1)).toMatchObject({ articleCount: 0 });
		expect(await listChannels(bare, U1)).toEqual([]);

		// listChannelArticles: null results and degenerate zero limit
		const page = stubDb({
			first: [{ report_date: "2026-01-01" }, { report_date: "2026-01-01" }],
			all: [
				null,
				[
					{
						id: 9,
						channel_id: 1,
						external_id: "e",
						title: "t",
						report_date: "2026-01-01",
						summary: null,
						author: null,
						source_label: "k",
						created_at_ms: 1,
					},
				],
			],
		});
		expect(await listChannelArticles(page, U1, 1, { date: null, before: 5, limit: 30 })).toEqual({
			items: [],
			nextCursor: null,
		});
		expect(await listChannelArticles(page, U1, 1, { date: null, before: 5, limit: 0 })).toEqual({
			items: [],
			nextCursor: null,
		});

		// ingest: changes reported but reload misses → throw
		const ghost = stubDb({ run: [{ meta: { changes: 1, last_row_id: 7 } }], first: [null] });
		await expect(
			ingestChannelArticle(ghost, U1, 1, { keyId: 1, label: "k" }, article()),
		).rejects.toThrow("failed to load article");

		// ingest: conflict path with no existing row → throw
		const missing = stubDb({ run: [{ meta: {} }], first: [null] });
		await expect(
			ingestChannelArticle(missing, U1, 1, { keyId: 1, label: "k" }, article()),
		).rejects.toThrow("ingest conflict but no existing row");

		// ingest: undefined summary/author on existing row fall back to null and match
		const lax = stubDb({
			run: [{ meta: {} }],
			first: [
				{
					id: 3,
					user_id: U1,
					channel_id: 1,
					external_id: "ext-1",
					title: "研报 · 2026-09-22",
					report_date: "2026-09-22",
					summary: undefined,
					author: undefined,
					markdown: "## 今日进展\n\n中文与 English。",
					tags_json: "[]",
					source_key_id: 1,
					source_label: "Research Agent",
					created_at_ms: 1,
				},
			],
		});
		const dup = await ingestChannelArticle(
			lax,
			U1,
			1,
			{ keyId: 1, label: "Research Agent" },
			article({ summary: null, author: null }),
		);
		expect(dup.status).toBe("duplicate");

		// createChannel: insert succeeds but reload misses → throw
		const ghostChannel = stubDb({ run: [{ meta: { changes: 1, last_row_id: 9 } }], first: [null] });
		await expect(createChannel(ghostChannel, U1, { name: "Ghost" })).rejects.toThrow(
			"failed to load channel",
		);
	});
});

function stubDb(script: {
	first?: Array<Record<string, unknown> | null>;
	all?: Array<Array<Record<string, unknown>> | null>;
	run?: Array<{ meta: Record<string, number> }>;
}): D1Database {
	let firstIdx = 0;
	let allIdx = 0;
	let runIdx = 0;
	return {
		prepare() {
			const stmt = {
				bind() {
					return stmt;
				},
				async first<T>() {
					const item = script.first?.[firstIdx++] ?? null;
					return item as T;
				},
				async all<T>() {
					const rows = script.all ? script.all[allIdx++] : undefined;
					return { results: (rows ?? null) as T[] };
				},
				async run() {
					return script.run?.[runIdx++] ?? { meta: {} };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}
