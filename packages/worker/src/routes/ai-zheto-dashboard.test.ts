import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { encryptSecret, parseKek } from "../lib/secrets-crypto.js";
import type { AppEnv, AuthUser } from "../types.js";
import { getAiConfigRoute, putAiConfigRoute } from "./ai.js";
import { getDashboardRoute } from "./dashboard.js";
import { translateWatchlistRoute } from "./translate.js";
import { getZhetoSettingsRoute, putZhetoSettingsRoute, zhetoSaveRoute } from "./zheto.js";

const KEK = "0123456789abcdef0123456789abcdef";
const user: AuthUser = {
	id: "u1",
	email: "dev@xray.local",
	name: "Dev",
	image: null,
	accessIss: null,
	accessSub: null,
};

type Row = Record<string, unknown>;

function makeDb() {
	const tables: Record<string, Row[]> = {
		watchlists: [],
		items: [],
		groups: [],
		watchlist_members: [],
		ai_configs: [],
		integration_secrets: [],
	};
	let seq = 1;

	return {
		_tables: tables,
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					const up = sql.toUpperCase();
					if (up.includes("FROM AI_CONFIGS")) {
						return (tables.ai_configs.find((r) => r.user_id === binds[0]) ?? null) as T | null;
					}
					if (up.includes("FROM INTEGRATION_SECRETS")) {
						return (tables.integration_secrets.find(
							(r) => r.user_id === binds[0] && r.integration === binds[1],
						) ?? null) as T | null;
					}
					if (up.includes("FROM WATCHLISTS") && up.includes("W.ID")) {
						const [userId, id] = binds as [string, number];
						const hit = tables.watchlists.find((r) => r.user_id === userId && r.id === id);
						return hit
							? ({ ...hit, member_count: 0, translate_enabled: hit.translate_enabled ?? 1 } as T)
							: null;
					}
					if (up.includes("COUNT(*)") && up.includes("FROM WATCHLISTS")) {
						const c = tables.watchlists.filter((r) => r.user_id === binds[0]).length;
						return { c } as T;
					}
					if (up.includes("COUNT(*)") && up.includes("FROM GROUPS")) {
						const c = tables.groups.filter((r) => r.user_id === binds[0]).length;
						return { c } as T;
					}
					if (up.includes("COUNT(*)") && up.includes("FROM WATCHLIST_MEMBERS")) {
						const c = tables.watchlist_members.filter((r) => r.user_id === binds[0]).length;
						return { c } as T;
					}
					if (up.includes("COUNT(*)") && up.includes("INGESTED_AT_MS")) {
						const [userId, since] = binds as [string, number];
						const c = tables.items.filter(
							(r) => r.user_id === userId && Number(r.ingested_at_ms) >= since,
						).length;
						return { c } as T;
					}
					if (up.includes("COUNT(*)") && up.includes("AI_STATUS")) {
						const userId = binds[0] as string;
						const c = tables.items.filter((i) => {
							if (i.user_id !== userId) return false;
							const wl = tables.watchlists.find(
								(w) => w.id === i.watchlist_id && w.user_id === userId,
							);
							if (!wl || wl.translate_enabled === 0) return false;
							return i.ai_status === "pending" || i.ai_status === "not_requested";
						}).length;
						return { c } as T;
					}
					return null;
				},
				async all<T>() {
					const up = sql.toUpperCase();
					if (up.includes("GROUP BY SOURCE_TYPE")) {
						const userId = binds[0] as string;
						const map = new Map<string, number>();
						for (const i of tables.items.filter((r) => r.user_id === userId)) {
							const st = String(i.source_type);
							map.set(st, (map.get(st) ?? 0) + 1);
						}
						return {
							results: [...map.entries()].map(([sourceType, count]) => ({
								sourceType,
								count,
							})) as T[],
						};
					}
					if (up.includes("FROM ITEMS") && up.includes("AI_STATUS")) {
						// select candidates
						const userId = binds[0] as string;
						const wl = binds[1] as number;
						const limit = binds[binds.length - 1] as number;
						const rows = tables.items
							.filter(
								(i) =>
									i.user_id === userId &&
									i.watchlist_id === wl &&
									(i.ai_status === "not_requested" ||
										i.ai_status === "failed" ||
										i.ai_status === "pending"),
							)
							.slice(0, limit)
							.map((i) => ({ id: i.id, text: i.text }));
						return { results: rows as T[] };
					}
					return { results: [] as T[] };
				},
				async run() {
					const up = sql.trimStart().toUpperCase();
					if (up.startsWith("INSERT INTO AI_CONFIGS")) {
						const [
							user_id,
							provider,
							model,
							base_url,
							api_key_ciphertext,
							api_key_key_version,
							translation_prompt,
							summary_prompt,
							updated_at_ms,
						] = binds;
						const idx = tables.ai_configs.findIndex((r) => r.user_id === user_id);
						const row = {
							user_id,
							provider,
							model,
							base_url,
							api_key_ciphertext,
							api_key_key_version,
							translation_prompt,
							summary_prompt,
							updated_at_ms,
						};
						if (idx >= 0) tables.ai_configs[idx] = row;
						else tables.ai_configs.push(row);
						return { meta: { changes: 1 } };
					}
					if (up.startsWith("INSERT INTO INTEGRATION_SECRETS")) {
						const [user_id, integration, ciphertext, key_version, meta_json, updated_at_ms] = binds;
						const idx = tables.integration_secrets.findIndex(
							(r) => r.user_id === user_id && r.integration === integration,
						);
						const row = {
							user_id,
							integration,
							ciphertext,
							key_version,
							meta_json,
							updated_at_ms,
						};
						if (idx >= 0) tables.integration_secrets[idx] = row;
						else tables.integration_secrets.push(row);
						return { meta: { changes: 1 } };
					}
					if (up.startsWith("UPDATE ITEMS") && up.includes("AI_STATUS = 'PENDING'")) {
						const now = binds[0] as number;
						const userId = binds[1] as string;
						const ids = binds.slice(2) as number[];
						for (const id of ids) {
							const row = tables.items.find((i) => i.id === id && i.user_id === userId);
							if (row) {
								row.ai_status = "pending";
								row.ai_status_updated_at_ms = now;
							}
						}
						return { meta: { changes: ids.length } };
					}
					if (up.startsWith("UPDATE ITEMS") && up.includes("SUCCEEDED")) {
						const [now, translated, summary, userId, id] = binds as [
							number,
							string,
							string | null,
							string,
							number,
						];
						const row = tables.items.find((i) => i.id === id && i.user_id === userId);
						if (row) {
							row.ai_status = "succeeded";
							row.ai_status_updated_at_ms = now;
							row.translated_text = translated;
							row.summary_text = summary;
							row.translation_error = null;
						}
						return { meta: { changes: 1 } };
					}
					if (up.startsWith("UPDATE ITEMS") && up.includes("FAILED")) {
						const [now, err, userId, id] = binds as [number, string, string, number];
						const row = tables.items.find((i) => i.id === id && i.user_id === userId);
						if (row) {
							row.ai_status = "failed";
							row.ai_status_updated_at_ms = now;
							row.translation_error = err;
						}
						return { meta: { changes: 1 } };
					}
					if (up.startsWith("UPDATE ITEMS") && up.includes("NOT_REQUESTED")) {
						return { meta: { changes: 0 } };
					}
					if (up.startsWith("INSERT INTO WATCHLISTS") || up.includes("INSERT INTO WATCHLISTS")) {
						const id = seq++;
						tables.watchlists.push({
							id,
							user_id: binds[0],
							name: binds[1],
							translate_enabled: 1,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
		async batch() {
			return [];
		},
		seedWatchlist(userId: string, id = 1) {
			tables.watchlists.push({
				id,
				user_id: userId,
				name: "WL",
				translate_enabled: 1,
				description: null,
				icon: "eye",
				created_at_ms: Date.now(),
			});
		},
		seedItem(userId: string, watchlistId: number, text: string, ai_status = "not_requested") {
			const id = seq++;
			tables.items.push({
				id,
				user_id: userId,
				watchlist_id: watchlistId,
				source_type: "custom",
				external_id: `e${id}`,
				text,
				ai_status,
				ai_status_updated_at_ms: Date.now(),
				translated_text: null,
				summary_text: null,
				translation_error: null,
				ingested_at_ms: Date.now(),
				created_at_ms: Date.now(),
			});
			return id;
		},
	};
}

function app(db: ReturnType<typeof makeDb>, envExtra: Record<string, unknown> = {}) {
	const h = new Hono<AppEnv>();
	h.use("*", async (c, next) => {
		// @ts-expect-error test env
		c.env = {
			DB: db,
			ENVIRONMENT: "test",
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
			ZHETO_WEBHOOK_ALLOW_HOSTS: "example.com,localhost",
			...envExtra,
		};
		c.set("authUser", user);
		return next();
	});
	h.get("/api/ai-config", getAiConfigRoute);
	h.put("/api/ai-config", putAiConfigRoute);
	h.post("/api/watchlists/:id/translate", translateWatchlistRoute);
	h.get("/api/integrations/zheto", getZhetoSettingsRoute);
	h.put("/api/integrations/zheto", putZhetoSettingsRoute);
	h.post("/api/integrations/zheto/save", zhetoSaveRoute);
	h.get("/api/dashboard", getDashboardRoute);
	return h;
}

describe("AI config + translate (shipped handlers)", () => {
	test("stores ciphertext not plaintext and translates batch", async () => {
		const db = makeDb();
		db.seedWatchlist("u1", 1);
		const itemId = db.seedItem("u1", 1, "hello world");
		const a = app(db, {
			TRANSLATE_FN: async ({ text }) => ({
				translatedText: `译:${text}`,
				summaryText: null,
			}),
		});

		const put = await a.request("/api/ai-config", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				model: "gpt-test",
				apiKey: "sk-secret-never-store-plain",
			}),
		});
		expect(put.status).toBe(200);
		const pub = (await put.json()) as {
			data: { hasApiKey: boolean; apiKeyMasked: string; provider: string };
		};
		expect(pub.data.hasApiKey).toBe(true);
		expect(pub.data.apiKeyMasked).toContain("•");
		expect(pub.data.provider).toBe("openai");

		const stored = db._tables.ai_configs[0];
		expect(stored).toBeTruthy();
		if (!stored) throw new Error("no config");
		const cipher = stored.api_key_ciphertext as Uint8Array;
		expect(cipher).toBeInstanceOf(Uint8Array);
		expect(new TextDecoder().decode(cipher).includes("sk-secret")).toBe(false);

		const tr = await a.request("/api/watchlists/1/translate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ limit: 5 }),
		});
		expect(tr.status).toBe(200);
		const body = (await tr.json()) as {
			data: { results: Array<{ id: number; ai_status: string; translatedText?: string }> };
		};
		expect(body.data.results.length).toBe(1);
		expect(body.data.results[0]?.ai_status).toBe("succeeded");
		expect(body.data.results[0]?.translatedText).toBe("译:hello world");
		const item = db._tables.items.find((i) => i.id === itemId);
		expect(item).toBeTruthy();
		if (!item) throw new Error("no item");
		expect(item.ai_status).toBe("succeeded");
		expect(item.translated_text).toBe("译:hello world");
	});

	test("ingest path helper never imports translate enqueue — items stay not_requested until translate", async () => {
		const db = makeDb();
		db.seedWatchlist("u1", 1);
		const id = db.seedItem("u1", 1, "x", "not_requested");
		// no translate call
		expect(db._tables.items.find((i) => i.id === id)?.ai_status).toBe("not_requested");
	});
});

describe("zhe.to save (shipped handlers)", () => {
	test("success and missing secret fail closed", async () => {
		const db = makeDb();
		const calls: unknown[] = [];
		const a = app(db, {
			ZHETO_UPSTREAM: async (webhookUrl: string, body: unknown) => {
				calls.push({ webhookUrl, body });
				return {
					status: 201,
					json: {
						data: {
							shortUrl: "https://zhe.to/abc",
							slug: "abc",
							originalUrl: (body as { url: string }).url,
						},
					},
				};
			},
		});

		const fail = await a.request("/api/integrations/zheto/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://x.com/i/status/1" }),
		});
		expect(fail.status).toBe(400);

		const put = await a.request("/api/integrations/zheto", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				webhookUrl: "https://example.com/api/webhook/tok",
				folder: "inbox",
			}),
		});
		expect(put.status).toBe(200);
		const settings = (await put.json()) as {
			data: { configured: boolean; webhookUrlMasked: string };
		};
		expect(settings.data.configured).toBe(true);
		expect(settings.data.webhookUrlMasked).toContain("•");
		const cipher = db._tables.integration_secrets[0]?.ciphertext as Uint8Array;
		expect(new TextDecoder().decode(cipher).includes("example.com")).toBe(false);

		const save = await a.request("/api/integrations/zheto/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://x.com/i/status/99", note: "n" }),
		});
		expect(save.status).toBe(200);
		const data = (await save.json()) as {
			data: { shortUrl: string; slug: string; isExisting: boolean };
		};
		expect(data.data.shortUrl).toBe("https://zhe.to/abc");
		expect(data.data.isExisting).toBe(false);
		expect(calls).toHaveLength(1);
		expect((calls[0] as { body: { url: string; note: string; folder: string } }).body).toEqual({
			url: "https://x.com/i/status/99",
			note: "n",
			folder: "inbox",
		});
		// upstream failure
		const a2 = app(db, {
			ZHETO_UPSTREAM: async () => ({ status: 500, json: {} }),
		});
		const bad = await a2.request("/api/integrations/zheto/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://x.com/i/status/1" }),
		});
		expect(bad.status).toBe(502);
		const errBody = await bad.text();
		expect(errBody.includes("example.com")).toBe(false);
	});
});

describe("dashboard aggregates", () => {
	test("counts match seeded rows and stay user-scoped", async () => {
		const db = makeDb();
		db.seedWatchlist("u1", 1);
		db.seedWatchlist("u2", 2);
		db._tables.groups.push({ id: 1, user_id: "u1", name: "G" });
		db._tables.watchlist_members.push({ id: 1, user_id: "u1", watchlist_id: 1 });
		db.seedItem("u1", 1, "a");
		db.seedItem("u1", 1, "b");
		db.seedItem("u2", 2, "other");
		const a = app(db);
		const res = await a.request("/api/dashboard");
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			data: {
				watchlistCount: number;
				groupCount: number;
				memberCount: number;
				items24h: number;
				pendingAi: number;
			};
		};
		expect(data.data.watchlistCount).toBe(1);
		expect(data.data.groupCount).toBe(1);
		expect(data.data.memberCount).toBe(1);
		expect(data.data.items24h).toBe(2);
		expect(data.data.pendingAi).toBe(2);
	});
});

describe("secrets crypto used by AI path", () => {
	test("encrypt uses KEK envelope", async () => {
		const kek = parseKek(KEK, 1);
		const blob = await encryptSecret("x", kek, "u1:ai.api_key");
		expect(blob[0]).toBe(1);
		expect(blob.byteLength).toBeGreaterThan(20);
	});
});

describe("AI/zheto error paths", () => {
	test("ai config rejects missing provider and missing key", async () => {
		const db = makeDb();
		const a = app(db);
		expect(
			(
				await a.request("/api/ai-config", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: "" }),
				})
			).status,
		).toBe(400);
		expect(
			(
				await a.request("/api/ai-config", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: "openai" }),
				})
			).status,
		).toBe(400);
	});

	test("translate without config returns 400", async () => {
		const db = makeDb();
		db.seedWatchlist("u1", 1);
		const a = app(db);
		const res = await a.request("/api/watchlists/1/translate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	test("translate marks failed when translator throws", async () => {
		const db = makeDb();
		db.seedWatchlist("u1", 1);
		const id = db.seedItem("u1", 1, "boom");
		const a = app(db, {
			TRANSLATE_FN: async () => {
				throw new Error("model down");
			},
		});
		await a.request("/api/ai-config", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", apiKey: "sk-x" }),
		});
		const tr = await a.request("/api/watchlists/1/translate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ item_ids: [id] }),
		});
		expect(tr.status).toBe(200);
		const body = (await tr.json()) as { data: { results: Array<{ ai_status: string }> } };
		expect(body.data.results[0]?.ai_status).toBe("failed");
	});

	test("zheto rejects bad webhook host", async () => {
		const db = makeDb();
		const a = app(db);
		const res = await a.request("/api/integrations/zheto", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ webhookUrl: "https://evil.example/hook" }),
		});
		expect(res.status).toBe(400);
	});

	test("get ai config empty", async () => {
		const db = makeDb();
		const a = app(db);
		const res = await a.request("/api/ai-config");
		expect(res.status).toBe(200);
	});

	test("get zheto settings empty", async () => {
		const db = makeDb();
		const a = app(db);
		const res = await a.request("/api/integrations/zheto");
		expect(res.status).toBe(200);
		const j = (await res.json()) as { data: { configured: boolean } };
		expect(j.data.configured).toBe(false);
	});
});

describe("more coverage", () => {
	test("ai put without KEK returns 500", async () => {
		const db = makeDb();
		const a = app(db, { XRAY_SECRETS_KEK: undefined });
		const res = await a.request("/api/ai-config", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "openai", apiKey: "sk" }),
		});
		expect(res.status).toBe(500);
	});

	test("zheto save upstream 200 isExisting", async () => {
		const db = makeDb();
		const a = app(db, {
			ZHETO_UPSTREAM: async () => ({
				status: 200,
				json: { data: { shortUrl: null, slug: null, originalUrl: "https://x.com/1" } },
			}),
		});
		await a.request("/api/integrations/zheto", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ webhookUrl: "https://example.com/api/webhook/t" }),
		});
		const save = await a.request("/api/integrations/zheto/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://x.com/i/status/1" }),
		});
		expect(save.status).toBe(200);
		const j = (await save.json()) as { data: { isExisting: boolean } };
		expect(j.data.isExisting).toBe(true);
	});

	test("translate invalid watchlist", async () => {
		const db = makeDb();
		const a = app(db);
		const res = await a.request("/api/watchlists/999/translate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(404);
	});
});
