import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { canonicalText, parseCanonicalItem } from "@xray/shared";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { EXTERNAL_MEDIA_FIXTURES, e2eCatalog } from "../../../../fixtures/e2e.js";
import { MOTION_BASE64, SVG_MEDIA } from "../../../../fixtures/media.js";
import {
	DEMO_IDENTITY,
	FIXTURE_ANCHOR_MS,
	fixtureIdentity,
	MEDIA_URLS,
} from "../../../../fixtures/primitives.js";
import {
	AI_BASE_URL,
	PREVIEW_DOCUMENTS,
	PROVIDER_SCENARIOS,
	ZHETO_WEBHOOK_URL,
} from "../../../../fixtures/protocol.js";
import fixtureProvider from "../../../../fixtures/providers.js";
import { createSqliteD1 } from "./sqlite-d1.js";

const fixtureFetch = fixtureProvider.fetch;

const seed = readFileSync(new URL("../../../../fixtures/demo.sql", import.meta.url), "utf8");
const empty = readFileSync(new URL("../../../../fixtures/empty.sql", import.meta.url), "utf8");

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

test("Demo SQL preserves rich content, relationships and the signed fixture identity", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	for (const [table, count] of [
		["users", 2],
		["watchlists", 13],
		["watchlist_members", 108],
		["groups", 13],
		["group_members", 106],
		["items", 239],
		["ingest_logs", 59],
		["channels", 15],
		["tags", 45],
		["channel_articles", 145],
		["push_tokens", 51],
	] as const) {
		expect(await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).toEqual({ count });
	}
	expect(
		await db
			.prepare("SELECT id,access_iss AS iss,access_sub AS sub,email,name FROM users WHERE id=?")
			.bind(DEMO_IDENTITY.id)
			.first(),
	).toEqual(DEMO_IDENTITY);
	expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
	for (const [parent, child, key] of [
		["watchlists", "watchlist_members", "watchlist_id"],
		["watchlists", "items", "watchlist_id"],
		["groups", "group_members", "group_id"],
		["channels", "channel_articles", "channel_id"],
	]) {
		expect(
			(
				await db
					.prepare(
						`SELECT c.id FROM ${child} c JOIN ${parent} p ON p.id=c.${key} WHERE c.user_id<>p.user_id`,
					)
					.all()
			).results,
		).toEqual([]);
	}
	expect(
		(
			await db
				.prepare("SELECT id FROM ingest_logs WHERE attempted<>accepted+deduped+rejected")
				.all()
		).results,
	).toEqual([]);
	expect(
		(
			await db
				.prepare(
					"SELECT is_read,COUNT(*) AS count FROM channel_articles WHERE channel_id=10 GROUP BY is_read ORDER BY is_read",
				)
				.all()
		).results,
	).toEqual([
		{ is_read: 0, count: 3 },
		{ is_read: 1, count: 1 },
	]);
	expect(
		await db
			.prepare("SELECT COUNT(*) AS count FROM push_tokens WHERE revoked_at_ms IS NULL")
			.first(),
	).toEqual({ count: 33 });
	expect(
		await db.prepare("SELECT COUNT(*) AS count FROM channel_tags WHERE channel_id=910102").first(),
	).toEqual({ count: 0 });
	expect(
		(
			await db
				.prepare(
					"SELECT k.id FROM push_tokens k JOIN channel_tags c ON c.channel_id=k.channel_id JOIN channel_key_tags t ON t.key_id=k.id AND t.tag_id=c.tag_id",
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
	expect(
		await db
			.prepare(
				"SELECT COUNT(*) AS count FROM group_members g JOIN watchlist_members w ON w.user_id=g.user_id AND w.source_type=g.source_type AND w.handle=g.handle WHERE g.id>=9600000",
			)
			.first(),
	).toEqual({ count: 78 });
});

test("every payload including the 28 old rows is canonical, anchored and coherent", async () => {
	const db = createSqliteD1();
	await db.exec(seed);
	const rows = (
		await db.prepare("SELECT * FROM items ORDER BY id").all<{
			id: number;
			source_type: string;
			external_id: string;
			text: string;
			payload_json: string;
			created_at_ms: number;
			ingested_at_ms: number;
			ai_status: string;
			translated_text: string | null;
			summary_text: string | null;
			translation_error: string | null;
		}>()
	).results;
	const media = new Set<string>();
	const refs = new Set<string>();
	const statuses = new Set<string>();
	const galleries = new Set<number>();
	let longItems = 0;
	for (const row of rows) {
		const parsed = parseCanonicalItem(JSON.parse(row.payload_json));
		expect(parsed.ok, `item ${row.id}`).toBe(true);
		if (!parsed.ok) throw new Error(parsed.message);
		const item = parsed.value;
		expect(item.source_type).toBe(row.source_type);
		expect(item.external_id).toBe(row.external_id);
		expect(canonicalText(item)).toBe(row.text);
		expect(Date.parse(item.created_at)).toBe(row.created_at_ms);
		expect(row.created_at_ms).toBeLessThanOrEqual(FIXTURE_ANCHOR_MS);
		expect(row.ingested_at_ms).toBe(row.created_at_ms);
		statuses.add(row.ai_status);
		if (row.id >= 9700000 && row.ai_status === "succeeded") expect(row.summary_text).toBeTruthy();
		expect(Boolean(row.translated_text)).toBe(row.ai_status === "succeeded");
		expect(Boolean(row.translation_error)).toBe(row.ai_status === "failed");
		if (item.source_type === "custom") {
			if (item.body.text.length > 700) longItems++;
		} else {
			for (const ref of item.body.tweet.referenced_tweets ?? []) refs.add(ref.type);
			for (const attachment of item.body.includes?.media ?? []) {
				media.add(attachment.type);
				expect(Object.values(MEDIA_URLS)).toContain(attachment.url);
			}
			galleries.add(item.body.tweet.attachments?.media_keys?.length ?? 0);
		}
	}
	expect([...statuses].sort()).toEqual(["failed", "not_requested", "pending", "succeeded"]);
	expect([...media].sort()).toEqual(["animated_gif", "photo", "video"]);
	expect([...refs].sort()).toEqual(["quoted", "replied_to"]);
	expect(galleries.has(2) && galleries.has(4)).toBe(true);
	expect(longItems).toBe(26);
	expect(await db.prepare("SELECT MAX(report_date) AS date FROM channel_articles").first()).toEqual(
		{ date: "2026-09-27" },
	);
	expect(
		(
			await db
				.prepare(`SELECT id FROM channel_articles WHERE created_at_ms>${FIXTURE_ANCHOR_MS}`)
				.all()
		).results,
	).toEqual([]);
});

test("Demo seed is deterministic and refuses replay without modifying edits; empty scenario inserts nothing", async () => {
	const db = createSqliteD1();
	const second = createSqliteD1();
	await db.exec(seed);
	await second.exec(seed);
	expect(await snapshot(db)).toEqual(await snapshot(second));
	await db.exec("UPDATE channel_articles SET markdown='My own draft',is_read=1 WHERE id=950000");
	const edited = await snapshot(db);
	await expect(db.exec(seed)).rejects.toThrow(/UNIQUE constraint/);
	expect(await snapshot(db)).toEqual(edited);
	const blank = createSqliteD1();
	const before = await snapshot(blank);
	await blank.exec(empty);
	expect(await snapshot(blank)).toEqual(before);
	expect(seed).not.toMatch(/INSERT OR|^UPDATE |^DELETE |date\('now'|unixepoch\(\)/m);
});

test("migration-compatible seed stays bounded per SQLite-parsed statement", () => {
	expect(Buffer.byteLength(seed)).toBeLessThan(90 * 1024);
	const db = new DatabaseSync(":memory:");
	try {
		const migrations = new URL("../../migrations/", import.meta.url);
		for (const name of readdirSync(migrations)
			.filter((name) => name.endsWith(".sql"))
			.sort())
			db.exec(readFileSync(new URL(name, migrations), "utf8"));
		let remaining = seed;
		while (remaining.trim()) {
			const statement = db.prepare(remaining).sourceSQL;
			expect(statement.length).toBeGreaterThan(0);
			expect(Buffer.byteLength(statement)).toBeLessThan(64 * 1024);
			db.exec(statement);
			remaining = remaining.slice(statement.length);
		}
	} finally {
		db.close();
	}
});

test("focused E2E primitives are fresh, canonical and limited to approved external media", () => {
	const first = e2eCatalog("run-a");
	const second = e2eCatalog("run-b");
	expect(first.owner.sub).not.toBe(second.owner.sub);
	expect(first.owner.email).not.toBe(first.other.email);
	expect(() => fixtureIdentity("../prod")).toThrow("Invalid fixture run ID");
	for (const item of first.items) expect(parseCanonicalItem(item).ok).toBe(true);
	first.items[0].external_id = "changed";
	expect(e2eCatalog("run-a").items[0].external_id).toBe("run-a-post");
	expect(
		EXTERNAL_MEDIA_FIXTURES.every(
			({ url }) => url.startsWith("https://") && !url.includes("/api/"),
		),
	).toBe(true);
	for (const [name, svg] of Object.entries(SVG_MEDIA))
		expect(
			readFileSync(
				new URL(`../../../../fixtures/media/${name}.svg`, import.meta.url),
				"utf8",
			).trim(),
		).toBe(svg);
	expect(
		readFileSync(new URL("../../../../fixtures/media/motion.mp4", import.meta.url)).toString(
			"base64",
		),
	).toBe(MOTION_BASE64);
});

const completion = (
	messages = [
		{ role: "system", content: "Reply with the single word: ok" },
		{ role: "user", content: "ping" },
	],
) =>
	new Request(`${AI_BASE_URL}/chat/completions`, {
		method: "POST",
		headers: { authorization: "Bearer fixture-local-key", "content-type": "application/json" },
		body: JSON.stringify({ model: "xray-fixture", messages }),
	});

test("provider speaks completion, profile and zhe.to protocols and rejects unknown egress", async () => {
	const ping = await fixtureFetch(completion());
	expect(await ping.json()).toMatchObject({
		object: "chat.completion",
		choices: [{ message: { content: "ok" } }],
	});
	const profile = await fixtureFetch(
		new Request(`https://lizheng.blog/api/authors/profile?hash=${"a".repeat(64)}`),
	);
	expect(await profile.json()).toEqual({ name: "Demo Owner", avatar: MEDIA_URLS.avatar });
	for (const scenario of ["success", "existing"]) {
		const response = await fixtureFetch(
			new Request(ZHETO_WEBHOOK_URL, {
				method: "POST",
				body: JSON.stringify({ url: "https://github.com/tw93/Kami" }),
			}),
			{ XRAY_FIXTURE_SCENARIO: scenario },
		);
		expect(response.status).toBe(scenario === "existing" ? 200 : 201);
		expect(await response.json()).toMatchObject({
			data: { originalUrl: "https://github.com/tw93/Kami", shortUrl: "https://zhe.to/fixture" },
		});
	}
	for (const url of [
		"https://unknown.example/path",
		`${AI_BASE_URL}/models`,
		"https://lizheng.blog/api/authors/profile?hash=invalid",
		`${MEDIA_URLS.desk}&extra=1`,
		"https://cloudflare-dns.com/dns-query?name=unlisted.com&type=A",
		"http://github.com/tw93/Kami",
	])
		expect((await fixtureFetch(new Request(url))).status).toBe(502);
	expect(
		(await fixtureFetch(new Request(ZHETO_WEBHOOK_URL, { method: "POST", body: "{" }))).status,
	).toBe(400);
	expect(
		(
			await fixtureFetch(
				new Request(`${AI_BASE_URL}/chat/completions`, { method: "POST", body: "{}" }),
			)
		).status,
	).toBe(400);
	expect((await fixtureFetch(completion(), { XRAY_FIXTURE_SCENARIO: "typo" })).status).toBe(500);
	for (const [scenario, status] of [
		["upstream-error", 503],
		["rate-limit", 429],
	] as const)
		expect((await fixtureFetch(completion(), { XRAY_FIXTURE_SCENARIO: scenario })).status).toBe(
			status,
		);
});

test("provider media supports actual bytes, HEAD, partial and unsatisfiable ranges", async () => {
	for (const url of new Set(Object.values(MEDIA_URLS))) {
		const response = await fixtureFetch(new Request(url));
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect(Number(response.headers.get("content-length"))).toBe(bytes.length);
		expect(bytes.length).toBeGreaterThan(100);
		expect(await (await fixtureFetch(new Request(url, { method: "HEAD" }))).text()).toBe("");
		for (const range of ["bytes=0-15", "bytes=-16"]) {
			const part = await fixtureFetch(new Request(url, { headers: { Range: range } }));
			expect(part.status).toBe(206);
			expect(new Uint8Array(await part.arrayBuffer())).toEqual(
				range === "bytes=0-15" ? bytes.slice(0, 16) : bytes.slice(-16),
			);
		}
		for (const range of ["bytes=999999-", "bytes=3-1", "bytes=-", "bytes=-0", "nonsense"])
			expect((await fixtureFetch(new Request(url, { headers: { Range: range } }))).status).toBe(
				416,
			);
	}
});

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");
let runtime: InstanceType<typeof Miniflare>;

describe("native fixture service and unmodified external business chain", () => {
	beforeAll(async () => {
		const provider = await build({
			entryPoints: [new URL("../../../../fixtures/providers.ts", import.meta.url).pathname],
			bundle: true,
			format: "esm",
			platform: "browser",
			write: false,
		});
		const app = await build({
			stdin: {
				contents: `import {translateAndSummarize} from './src/lib/ai-client.ts';
import {fetchLinkPreview} from './src/lib/link-preview.ts';
export default {async fetch(request,env){const input=await request.json();
try {return Response.json(input.ai ? await translateAndSummarize({text:'Keep the source.',quotedText:'Keep the question.',apiKey:'fixture-local-key',summaryPrompt:'Summarize in one sentence.'},env) : await fetchLinkPreview(input.url,env));}
catch(error){return Response.json({error:error.message},{status:502});}}};`,
				resolveDir: process.cwd(),
				loader: "ts",
			},
			bundle: true,
			format: "esm",
			platform: "browser",
			write: false,
		});
		const outboundService = async () => {
			throw new Error("Unexpected public egress");
		};
		runtime = new Miniflare(
			convertV4MiniflareOptions({
				workers: PROVIDER_SCENARIOS.flatMap((scenario) => [
					{
						name: `app-${scenario}`,
						modules: true,
						script: app.outputFiles[0].text,
						compatibilityDate: "2026-09-27",
						outboundService,
						serviceBindings: { XRAY_EXTERNAL: `provider-${scenario}` },
					},
					{
						name: `provider-${scenario}`,
						modules: true,
						script: provider.outputFiles[0].text,
						compatibilityDate: "2026-09-27",
						outboundService,
						bindings: { XRAY_FIXTURE_SCENARIO: scenario },
					},
				]),
			}),
		);
		await runtime.ready;
	}, 30000);
	afterAll(async () => {
		await runtime?.dispose();
	});
	async function call(scenario: string, input: Record<string, unknown>) {
		const worker = await runtime.getWorker(`app-${scenario}`);
		return worker.fetch("https://worker.test", { method: "POST", body: JSON.stringify(input) });
	}
	test("translation, quoted translation and summary parse through the real client", async () => {
		const response = await call("success", { ai: true });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			translatedText: "将来源保留在观察记录旁，围绕一个明确问题展开实验。",
			quotedTranslatedText: "复核结果时，始终保留最初的问题。",
			summaryText: "先保留原始资料，再验证观察结果。",
		});
		for (const scenario of ["upstream-error", "rate-limit", "malformed", "oversized"])
			expect((await call(scenario, { ai: true })).status).toBe(502);
	});
	test("DNS, redirects, HTML parser and response bounds remain active", async () => {
		const url = "https://developers.cloudflare.com/workers/";
		const result = await call("success", { url });
		expect(await result.json()).toMatchObject({
			url,
			title: PREVIEW_DOCUMENTS[url].title,
			imageUrl: MEDIA_URLS.desk,
		});
		for (const scenario of [
			"private-dns",
			"redirect-private",
			"oversized",
			"upstream-error",
			"malformed",
			"rate-limit",
		])
			expect(await (await call(scenario, { url })).json()).toMatchObject({
				url,
				title: null,
				imageUrl: null,
			});
		for (const rejected of [
			"https://127.0.0.1/private",
			"https://internal.test/",
			"https://unknown.example.net/",
			"https://example.com/xray-demo-preview-unavailable-v1",
		])
			expect(await (await call("success", { url: rejected })).json()).toMatchObject({
				url: rejected,
				title: null,
			});
	});
});
