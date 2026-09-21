import type { ParsedArticle } from "@xray/shared";
import { describe, expect, test } from "vitest";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import {
	createChannel,
	getChannel,
	getChannelArticle,
	ingestChannelArticle,
	listChannelArticles,
	listChannels,
	updateChannel,
} from "./channels.js";
import { createChannelKey } from "./push-tokens.js";

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
