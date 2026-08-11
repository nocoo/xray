/**
 * Route-level harness for post-S5 product gaps (docs/04):
 * - POST /api/groups/:id/members/import
 * - POST /api/groups/:id/copy-to-watchlist
 * - GET  /api/watchlists/:id/ingest-logs
 * - POST /api/ai-config/test
 *
 * Each route: 401 unauth, happy-path JSON shape, one failure (bad body or cross-user 404).
 */

import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { encryptSecret, parseKek } from "../lib/secrets-crypto.js";
import type { AppEnv, AuthUser } from "../types.js";
import { testAiConfigRoute } from "./ai.js";
import { bulkImportGroupMembersRoute, copyGroupToWatchlistRoute } from "./groups.js";
import { listWatchlistIngestLogsRoute } from "./ingest-logs.js";

const KEK = "0123456789abcdef0123456789abcdef";
const user: AuthUser = {
	id: "u1",
	email: "a@b.c",
	name: null,
	image: null,
	accessIss: null,
	accessSub: null,
};

type Row = Record<string, unknown>;

function mockProductDb() {
	const groups: Row[] = [];
	const group_members: Row[] = [];
	const watchlists: Row[] = [];
	const watchlist_members: Row[] = [];
	const ingest_logs: Row[] = [];
	const ai_configs: Row[] = [];
	let gid = 1;
	let gmid = 1;
	let wlid = 1;
	let wmid = 1;
	let lid = 1;

	const db = {
		prepare(sql: string) {
			const s = sql.replace(/\s+/g, " ");
			return {
				bind(...binds: unknown[]) {
					return {
						async first<T>() {
							if (s.includes("FROM groups g WHERE g.user_id") && s.includes("g.id = ?")) {
								const g = groups.find((x) => x.user_id === binds[0] && x.id === binds[1]);
								if (!g) return null;
								return {
									...g,
									member_count: group_members.filter((m) => m.group_id === g.id).length,
								} as T;
							}
							if (
								s.includes("FROM watchlists") &&
								s.includes("user_id") &&
								(s.includes("w.id = ?") || s.includes("AND id = ?") || s.includes("AND w.id"))
							) {
								// getWatchlist uses w.user_id + w.id; copy uses bare watchlists
								const userId = binds[0] as string;
								const id = binds[1] as number;
								const w = watchlists.find((x) => x.user_id === userId && x.id === id);
								if (!w) return null;
								if (s.includes("member_count") || s.includes("COUNT")) {
									return {
										...w,
										member_count: watchlist_members.filter((m) => m.watchlist_id === w.id).length,
									} as T;
								}
								return w as T;
							}
							if (s.includes("FROM watchlists w") && s.includes("w.id = ?")) {
								const w = watchlists.find((x) => x.user_id === binds[0] && x.id === binds[1]);
								if (!w) return null;
								return {
									...w,
									member_count: watchlist_members.filter((m) => m.watchlist_id === w.id).length,
								} as T;
							}
							if (s.includes("SELECT id FROM watchlists WHERE user_id")) {
								const w = watchlists.find((x) => x.user_id === binds[0] && x.id === binds[1]);
								return (w ? { id: w.id } : null) as T | null;
							}
							if (s.includes("FROM group_members WHERE id = ?")) {
								return (group_members.find((m) => m.id === binds[0] && m.user_id === binds[1]) ??
									null) as T | null;
							}
							if (s.includes("FROM watchlist_members WHERE id = ?")) {
								return (watchlist_members.find(
									(m) => m.id === binds[0] && m.user_id === binds[1],
								) ?? null) as T | null;
							}
							if (s.includes("FROM ai_configs WHERE user_id")) {
								return (ai_configs.find((r) => r.user_id === binds[0]) ?? null) as T | null;
							}
							return null;
						},
						async all<T>() {
							if (s.includes("FROM group_members WHERE user_id")) {
								return {
									results: group_members.filter(
										(m) => m.user_id === binds[0] && m.group_id === binds[1],
									) as T[],
								};
							}
							if (s.includes("FROM ingest_logs") && s.includes("watchlist_id")) {
								const rows = ingest_logs
									.filter((l) => l.user_id === binds[0] && l.watchlist_id === binds[1])
									.sort(
										(a, b) =>
											(b.created_at_ms as number) - (a.created_at_ms as number) ||
											(b.id as number) - (a.id as number),
									)
									.slice(0, binds[2] as number);
								return { results: rows as T[] };
							}
							if (s.includes("watchlist_member_tags")) {
								return { results: [] as T[] };
							}
							if (s.includes("FROM tags WHERE user_id")) {
								return { results: [] as T[] };
							}
							return { results: [] as T[] };
						},
						async run() {
							if (s.startsWith("INSERT INTO group_members")) {
								const handle = binds[4] as string;
								const group_id = binds[1] as number;
								if (
									group_members.some(
										(m) =>
											m.group_id === group_id && m.handle === handle && m.source_type === binds[2],
									)
								) {
									throw new Error("UNIQUE constraint failed");
								}
								const id = gmid++;
								group_members.push({
									id,
									user_id: binds[0],
									group_id,
									source_type: binds[2],
									external_author_id: binds[3],
									handle,
									display_name: binds[5],
									added_at_ms: binds[6],
								});
								return { meta: { last_row_id: id, changes: 1 } };
							}
							if (s.startsWith("INSERT INTO watchlist_members")) {
								const handle = binds[4] as string;
								const watchlist_id = binds[1] as number;
								if (
									watchlist_members.some(
										(m) =>
											m.watchlist_id === watchlist_id &&
											m.handle === handle &&
											m.source_type === binds[2],
									)
								) {
									throw new Error("UNIQUE constraint failed");
								}
								const id = wmid++;
								watchlist_members.push({
									id,
									user_id: binds[0],
									watchlist_id,
									source_type: binds[2],
									external_author_id: binds[3],
									handle,
									display_name: binds[5],
									note: binds[6],
									added_at_ms: binds[7],
								});
								return { meta: { last_row_id: id, changes: 1 } };
							}
							return { meta: { last_row_id: 0, changes: 0 } };
						},
					};
				},
			};
		},
		async batch() {
			return [];
		},
	} as unknown as D1Database;

	return {
		db,
		seedGroup(userId: string, name = "G") {
			const id = gid++;
			groups.push({
				id,
				user_id: userId,
				name,
				description: null,
				icon: "users",
				created_at_ms: Date.now(),
			});
			return id;
		},
		seedWatchlist(userId: string, name = "WL") {
			const id = wlid++;
			watchlists.push({
				id,
				user_id: userId,
				name,
				description: null,
				icon: "eye",
				translate_enabled: 1,
				created_at_ms: Date.now(),
			});
			return id;
		},
		seedGroupMember(userId: string, groupId: number, handle: string, sourceType = "x.com") {
			const id = gmid++;
			group_members.push({
				id,
				user_id: userId,
				group_id: groupId,
				source_type: sourceType,
				external_author_id: null,
				handle,
				display_name: null,
				added_at_ms: Date.now(),
			});
			return id;
		},
		seedIngestLog(userId: string, watchlistId: number) {
			const id = lid++;
			ingest_logs.push({
				id,
				user_id: userId,
				watchlist_id: watchlistId,
				attempted: 3,
				accepted: 2,
				deduped: 1,
				rejected: 0,
				errors_json: null,
				created_at_ms: Date.now(),
			});
			return id;
		},
		async seedAiConfig(userId: string, apiKey = "sk-test-key") {
			const blob = await encryptSecret(apiKey, parseKek(KEK, 1), `${userId}:ai.api_key`);
			ai_configs.push({
				user_id: userId,
				provider: "openai",
				model: "gpt-4o-mini",
				base_url: "https://api.openai.com/v1",
				api_key_ciphertext: blob,
				api_key_key_version: 1,
				translation_prompt: null,
				summary_prompt: null,
				updated_at_ms: Date.now(),
			});
		},
		group_members,
		watchlist_members,
	};
}

function appWithUser(
	userOrNull: AuthUser | null,
	db: D1Database,
	envExtra: Partial<AppEnv["Bindings"]> = {},
) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		if (userOrNull) c.set("authUser", userOrNull);
		c.env = {
			DB: db,
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
			...envExtra,
		} as AppEnv["Bindings"];
		await next();
	});
	app.post("/api/groups/:id/members/import", bulkImportGroupMembersRoute);
	app.post("/api/groups/:id/copy-to-watchlist", copyGroupToWatchlistRoute);
	app.get("/api/watchlists/:id/ingest-logs", listWatchlistIngestLogsRoute);
	app.post("/api/ai-config/test", testAiConfigRoute);
	return app;
}

const origFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = origFetch;
	vi.restoreAllMocks();
});

describe("POST /api/groups/:id/members/import", () => {
	test("401 without user", async () => {
		const { db } = mockProductDb();
		const app = appWithUser(null, db);
		const res = await app.request("http://localhost/api/groups/1/members/import", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "@alice" }),
		});
		expect(res.status).toBe(401);
	});

	test("happy path returns added/skipped/total", async () => {
		const mock = mockProductDb();
		const gid = mock.seedGroup("u1");
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/groups/${gid}/members/import`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "@alice\nbob\n@alice\n" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			data: { added: number; skipped: number; total: number };
		};
		expect(body.success).toBe(true);
		expect(body.data.added).toBe(2);
		expect(body.data.skipped).toBe(0);
		expect(body.data.total).toBe(2);
		expect(mock.group_members.filter((m) => m.group_id === gid)).toHaveLength(2);
	});

	test("400 bad body missing text", async () => {
		const mock = mockProductDb();
		const gid = mock.seedGroup("u1");
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/groups/${gid}/members/import`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toMatch(/text required/i);
	});

	test("404 cross-user group", async () => {
		const mock = mockProductDb();
		const gid = mock.seedGroup("other-user");
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/groups/${gid}/members/import`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "@alice" }),
		});
		expect(res.status).toBe(404);
	});
});

describe("POST /api/groups/:id/copy-to-watchlist", () => {
	test("401 without user", async () => {
		const { db } = mockProductDb();
		const app = appWithUser(null, db);
		const res = await app.request("http://localhost/api/groups/1/copy-to-watchlist", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ watchlistId: 1 }),
		});
		expect(res.status).toBe(401);
	});

	test("happy path copies members", async () => {
		const mock = mockProductDb();
		const gid = mock.seedGroup("u1");
		const wlid = mock.seedWatchlist("u1");
		mock.seedGroupMember("u1", gid, "alice");
		mock.seedGroupMember("u1", gid, "bob");
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/groups/${gid}/copy-to-watchlist`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ watchlistId: wlid }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			data: { added: number; skipped: number; total: number };
		};
		expect(body.success).toBe(true);
		expect(body.data.added).toBe(2);
		expect(body.data.total).toBe(2);
		expect(mock.watchlist_members.filter((m) => m.watchlist_id === wlid)).toHaveLength(2);
	});

	test("400 missing watchlistId", async () => {
		const mock = mockProductDb();
		const gid = mock.seedGroup("u1");
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/groups/${gid}/copy-to-watchlist`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/watchlistId/i);
	});

	test("404 foreign watchlist", async () => {
		const mock = mockProductDb();
		const gid = mock.seedGroup("u1");
		const foreignWl = mock.seedWatchlist("other");
		mock.seedGroupMember("u1", gid, "alice");
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/groups/${gid}/copy-to-watchlist`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ watchlistId: foreignWl }),
		});
		expect(res.status).toBe(404);
	});
});

describe("GET /api/watchlists/:id/ingest-logs", () => {
	test("401 without user", async () => {
		const { db } = mockProductDb();
		const app = appWithUser(null, db);
		const res = await app.request("http://localhost/api/watchlists/1/ingest-logs");
		expect(res.status).toBe(401);
	});

	test("happy path returns log DTOs", async () => {
		const mock = mockProductDb();
		const wlid = mock.seedWatchlist("u1");
		mock.seedIngestLog("u1", wlid);
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/watchlists/${wlid}/ingest-logs?limit=10`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			data: Array<{
				id: number;
				watchlistId: number;
				attempted: number;
				accepted: number;
				deduped: number;
				rejected: number;
			}>;
		};
		expect(body.success).toBe(true);
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.watchlistId).toBe(wlid);
		expect(body.data[0]?.accepted).toBe(2);
		expect(body.data[0]?.attempted).toBe(3);
	});

	test("404 cross-user watchlist", async () => {
		const mock = mockProductDb();
		const wlid = mock.seedWatchlist("other");
		mock.seedIngestLog("other", wlid);
		const app = appWithUser(user, mock.db);
		const res = await app.request(`http://localhost/api/watchlists/${wlid}/ingest-logs`);
		expect(res.status).toBe(404);
	});
});

describe("POST /api/ai-config/test (route harness)", () => {
	test("401 without user", async () => {
		const { db } = mockProductDb();
		const app = appWithUser(null, db);
		const res = await app.request("http://localhost/api/ai-config/test", { method: "POST" });
		expect(res.status).toBe(401);
	});

	test("happy path ok:true after decrypt + fetch", async () => {
		const mock = mockProductDb();
		await mock.seedAiConfig("u1", "sk-live");
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			expect(url).toContain("/chat/completions");
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const app = appWithUser(user, mock.db);
		const res = await app.request("http://localhost/api/ai-config/test", { method: "POST" });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			data: { ok: boolean; status: number; provider: string; model: string | null };
		};
		expect(body.success).toBe(true);
		expect(body.data.ok).toBe(true);
		expect(body.data.status).toBe(200);
		expect(body.data.provider).toBe("openai");
		expect(body.data.model).toBe("gpt-4o-mini");
		expect(fetchMock).toHaveBeenCalledOnce();
		const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(String(init.headers && (init.headers as Record<string, string>).authorization)).toMatch(
			/Bearer sk-live/,
		);
	});

	test("upstream non-OK returns ok:false", async () => {
		const mock = mockProductDb();
		await mock.seedAiConfig("u1");
		globalThis.fetch = vi.fn(
			async () => new Response("rate limited", { status: 429 }),
		) as unknown as typeof fetch;

		const app = appWithUser(user, mock.db);
		const res = await app.request("http://localhost/api/ai-config/test", { method: "POST" });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			data: { ok: boolean; status: number; error: string };
		};
		expect(body.success).toBe(true);
		expect(body.data.ok).toBe(false);
		expect(body.data.status).toBe(429);
		expect(body.data.error).toMatch(/rate limited/i);
	});

	test("400 when AI not configured", async () => {
		const mock = mockProductDb();
		const app = appWithUser(user, mock.db);
		const res = await app.request("http://localhost/api/ai-config/test", { method: "POST" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/not configured/i);
	});
});
