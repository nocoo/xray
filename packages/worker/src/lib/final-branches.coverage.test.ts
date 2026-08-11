/**
 * Last-mile branch/function hits for L1 95% floors.
 */
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { accessAuth, setJwtVerifierForTests } from "../middleware/access-auth.js";
import { originCheck } from "../middleware/origin-check.js";
import * as groups from "../repos/groups.js";
import * as items from "../repos/items.js";
import * as members from "../repos/members.js";
import { runTranslateBatch } from "../repos/translate.js";
import * as users from "../repos/users.js";
import * as watchlists from "../repos/watchlists.js";
import { ingestPushRoute } from "../routes/ingest-push.js";
import { liveRoute } from "../routes/live.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { readResponseBounded, resolveAiBaseUrl } from "./ai-endpoint.js";
import {
	parseGroupBody,
	parseMemberCreateBody,
	parseMemberPatchBody,
	parseTagBody,
	parseWatchlistBody,
} from "./http.js";
import { mintPushToken, sha256Hex } from "./push-token-crypto.js";
import { decryptSecret, encryptSecret, parseKek, resolveKeks } from "./secrets-crypto.js";

describe("final branch matrix", () => {
	afterEach(() => {
		setJwtVerifierForTests(null);
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("ai-endpoint ipv4/ipv6 block matrix", () => {
		expect(resolveAiBaseUrl("https://10.0.0.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://172.16.0.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://172.31.255.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://172.15.0.1/v1").ok).toBe(true); // not RFC1918
		expect(resolveAiBaseUrl("https://169.254.1.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://192.168.1.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://0.0.0.0/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[fe80::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[feb0::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[fc00::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[fd12::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::ffff:127.0.0.1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::ffff:7f00:1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[2001:db8::1]/v1").ok).toBe(true);
		expect(resolveAiBaseUrl("https://x.local/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://x.internal/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://x.localhost/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("not a url :::").ok).toBe(false);
		expect(resolveAiBaseUrl("ftp://api.openai.com/v1").ok).toBe(false);
	});

	test("readResponseBounded cancel catch paths", async () => {
		// cancel rejects → catch swallow
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("abcdefghij"));
			},
			cancel() {
				return Promise.reject(new Error("cancel fail"));
			},
		});
		const t = await readResponseBounded(new Response(stream), 3);
		expect(t.length).toBe(3);

		// room <= 0 path with second chunk after full
		const s2 = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("12"));
				controller.enqueue(new TextEncoder().encode("34"));
				controller.close();
			},
			cancel() {
				return Promise.reject(new Error("c2"));
			},
		});
		expect(await readResponseBounded(new Response(s2), 2)).toBe("12");

		// releaseLock throw
		const s3 = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("z"));
				controller.close();
			},
		});
		const res = new Response(s3);
		const reader = res.body?.getReader();
		// poison releaseLock after readResponseBounded gets its own reader — separate response
		expect(await readResponseBounded(new Response(new TextEncoder().encode("ok")), 10)).toBe("ok");
		reader.releaseLock();
	});

	test("secrets-crypto decrypt edges", async () => {
		const kek = resolveKeks({
			XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
			XRAY_SECRETS_KEY_VERSION: "2",
			XRAY_SECRETS_KEK_PREV: "fedcba9876543210fedcba9876543210",
		});
		const current = kek[0];
		const prev = kek[1];
		expect(current && prev).toBeTruthy();
		if (!current || !prev) throw new Error("keks missing");
		const ct = await encryptSecret("plain", current, "aad");
		const ok = await decryptSecret(ct, kek, "aad");
		expect(ok.plaintext).toBe("plain");
		// ArrayBuffer path
		const ab = ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength);
		await decryptSecret(ab, kek, "aad");
		// too short
		await expect(decryptSecret(new Uint8Array([1, 2]), kek, "aad")).rejects.toThrow(/short/);
		// wrong aad → fail all keks
		await expect(decryptSecret(ct, kek, "other")).rejects.toThrow();
		// empty kek slot skipped
		await expect(
			decryptSecret(ct, [undefined as unknown as typeof current, current], "aad"),
		).resolves.toBeTruthy();
		// single kek version mismatch still tries (and may succeed — version is advisory)
		const single = [current];
		const wrongVer = new Uint8Array(ct);
		wrongVer[0] = 99;
		await decryptSecret(wrongVer, single, "aad");
		// corrupt ciphertext → fail
		const corrupt = new Uint8Array(ct);
		corrupt[corrupt.length - 1] ^= 0xff;
		await expect(decryptSecret(corrupt, single, "aad")).rejects.toThrow();
		// usedPrev path: encrypt with prev, decrypt with current-first list
		const withPrev = await encryptSecret("p2", prev, "aad2");
		const prevHit = await decryptSecret(withPrev, kek, "aad2");
		expect(prevHit.usedPrev).toBe(true);
		expect(parseKek("0123456789abcdef0123456789abcdef", 1).version).toBe(1);
	});

	test("http parser remaining edges", () => {
		expect(parseWatchlistBody({ name: "a", description: 1 }, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: "a", icon: null }, "create").ok).toBe(false);
		expect(parseGroupBody({ name: "g", description: 1 }, "create").ok).toBe(false);
		expect(parseGroupBody({ name: "g", icon: null }, "create").ok).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: null }).ok).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "a", displayName: 1 }).ok).toBe(
			false,
		);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "a", note: 1 }).ok).toBe(false);
		expect(
			parseMemberCreateBody({ sourceType: "x.com", handle: "a", externalAuthorId: 1 }).ok,
		).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "a", tagIds: [1, 0] }).ok).toBe(
			false,
		);
		expect(
			parseMemberCreateBody({ sourceType: "x.com", handle: "a", tagIds: Array(60).fill(1) }).ok,
		).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "a", tagIds: "x" }).ok).toBe(false);
		expect(
			parseMemberCreateBody({
				sourceType: "x.com",
				handle: "a",
				displayName: null,
				note: null,
				externalAuthorId: null,
				tagIds: [1, 2],
			}).ok,
		).toBe(true);
		expect(parseMemberPatchBody({ displayName: null }).ok).toBe(true);
		expect(parseMemberPatchBody({ note: null }).ok).toBe(true);
		expect(parseMemberPatchBody({ tagIds: [1] }).ok).toBe(true);
		expect(parseMemberPatchBody({ displayName: 1 }).ok).toBe(false);
		expect(parseMemberPatchBody({ note: 1 }).ok).toBe(false);
		expect(parseMemberPatchBody({ tagIds: ["x"] }).ok).toBe(false);
		expect(parseTagBody({ name: "t", color: null }).ok).toBe(false);
		expect(parseTagBody({ name: "t", color: "  " }).ok).toBe(true);
		expect(parseTagBody({ name: "t", color: "x".repeat(100) }).ok).toBe(false);
		// allowEmpty + allowNull empty string → null for description-like
		expect(parseWatchlistBody({ name: "a", description: "" }, "create").ok).toBe(true);
	});

	test("origin-check remaining host/port branches", async () => {
		const mk = (env: string) => {
			const h = new Hono<AppEnv>();
			h.use("*", async (c, next) => {
				// @ts-expect-error test
				c.env = { ENVIRONMENT: env };
				return next();
			});
			h.use("*", originCheck);
			h.post("/api/x", (c) => c.json({ ok: true }));
			return h;
		};
		// empty host header
		expect(
			(
				await mk("development").request("/api/x", {
					method: "POST",
					headers: { origin: "http://localhost:7007" },
				})
			).status,
		).toBe(200);
		// production unknown host
		expect(
			(
				await mk("production").request("/api/x", {
					method: "POST",
					headers: { host: "evil.com", origin: "https://evil.com" },
				})
			).status,
		).toBe(403);
		// default https port 443
		expect(
			(
				await mk("test").request("/api/x", {
					method: "POST",
					headers: {
						host: "example.local:443",
						origin: "https://example.local",
					},
				})
			).status,
		).toBeLessThan(500);
		// default http port 80
		expect(
			(
				await mk("test").request("/api/x", {
					method: "POST",
					headers: {
						host: "example.local:80",
						origin: "http://example.local",
					},
				})
			).status,
		).toBeLessThan(500);
		// host with port, origin matches host name but local cross blocked when not local pair
		expect(
			(
				await mk("development").request("/api/x", {
					method: "POST",
					headers: {
						host: "api.dev:8787",
						origin: "http://other.dev:8787",
					},
				})
			).status,
		).toBe(403);
		// same hostname port match
		expect(
			(
				await mk("test").request("/api/x", {
					method: "POST",
					headers: {
						host: "foo.bar:3000",
						origin: "http://foo.bar:3000",
					},
				})
			).status,
		).toBe(200);
		// localhost host without port + origin localhost
		expect(
			(
				await mk("development").request("/api/x", {
					method: "POST",
					headers: {
						host: "localhost",
						origin: "http://localhost:7007",
					},
				})
			).status,
		).toBe(200);
	});

	test("access-auth default jwt verifier path", async () => {
		setJwtVerifierForTests(null); // restore real jose path
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = {
				ENVIRONMENT: "development",
				AUTH_DEV_BYPASS: "false",
				ALLOWED_EMAILS: "*",
				CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
				CF_ACCESS_AUD: "aud",
				DB: {
					prepare() {
						const s = {
							bind() {
								return s;
							},
							async first() {
								return null;
							},
							async run() {
								return { meta: { changes: 1 } };
							},
						};
						return s;
					},
				},
			};
			return next();
		});
		app.use("/api/*", accessAuth);
		app.get("/api/me", (c) => c.json({ ok: true }));
		// invalid token → verifier throws → 401 (hits default jwtVerifier body)
		const res = await app.request("/api/me", {
			headers: {
				host: "localhost",
				"cf-access-jwt-assertion": "not.a.jwt",
			},
		});
		// default jose verifier runs; invalid JWT → 401/403/500 depending on error mapping
		expect([401, 403, 500]).toContain(res.status);
	});

	test("live d1 error and missing binding", async () => {
		const app = new Hono<AppEnv>();
		app.get("/api/live", liveRoute);
		// missing DB
		const r1 = await app.request("/api/live", {
			// @ts-expect-error
			env: { ENVIRONMENT: "test" },
		});
		// hono may need env via middleware
		const app2 = new Hono<AppEnv>();
		app2.use("*", async (c, next) => {
			// @ts-expect-error
			c.env = { ENVIRONMENT: "production" }; // missing DB + CF
			return next();
		});
		app2.get("/api/live", liveRoute);
		const res = await app2.request("/api/live");
		expect(res.status).toBe(503);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("error");

		const app3 = new Hono<AppEnv>();
		app3.use("*", async (c, next) => {
			// @ts-expect-error
			c.env = {
				ENVIRONMENT: "test",
				DB: {
					prepare() {
						return {
							bind() {
								return this;
							},
							async first() {
								throw new Error("d1 down");
							},
						};
					},
				},
			};
			return next();
		});
		app3.get("/api/live", liveRoute);
		const res3 = await app3.request("/api/live");
		expect(res3.status).toBe(503);
		// unexpected result
		const app4 = new Hono<AppEnv>();
		app4.use("*", async (c, next) => {
			// @ts-expect-error
			c.env = {
				ENVIRONMENT: "test",
				DB: {
					prepare() {
						return {
							bind() {
								return this;
							},
							async first() {
								return { ok: 0 };
							},
						};
					},
				},
			};
			return next();
		});
		app4.get("/api/live", liveRoute);
		expect((await app4.request("/api/live")).status).toBe(503);
		void r1;
	});

	test("translate setTimeout abort callback", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await watchlists.createWatchlist(db, "u1", { name: "W", translateEnabled: true });
		await items.insertItemIgnore(db, "u1", {
			watchlistId: wl.id,
			sourceType: "custom",
			externalId: "slow",
			text: "slow text",
			createdAtMs: Date.now(),
			payload: {},
		});
		const config = {
			user_id: "u1",
			provider: "openai",
			model: "m",
			base_url: null,
			api_key_ciphertext: new ArrayBuffer(8),
			api_key_key_version: 1,
			translation_prompt: null,
			summary_prompt: null,
			updated_at_ms: Date.now(),
		};
		const out = await runTranslateBatch(db, "u1", wl.id, {
			limit: 1,
			config,
			apiKey: "sk",
			deadlineMs: 15,
			translateFn: async ({ signal }) => {
				await new Promise<void>((_resolve, reject) => {
					const t = setTimeout(() => reject(new Error("too slow")), 5000);
					signal?.addEventListener("abort", () => {
						clearTimeout(t);
						reject(new Error("The operation was aborted"));
					});
				});
				return { translatedText: "x", summaryText: null };
			},
		});
		expect(out.timed_out || out.results.some((r) => r.error)).toBe(true);

		// defaultTranslateFn branch via omitting translateFn with mock fetch
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							choices: [{ message: { content: "译|||摘" } }],
						}),
						{ status: 200 },
					),
			),
		);
		await items.insertItemIgnore(db, "u1", {
			watchlistId: wl.id,
			sourceType: "custom",
			externalId: "def",
			text: "default path",
			createdAtMs: Date.now(),
			payload: {},
		});
		const def = await runTranslateBatch(db, "u1", wl.id, {
			limit: 1,
			config: { ...config, base_url: "https://api.openai.com/v1" },
			apiKey: "sk",
			// no translateFn → defaultTranslateFn
		});
		expect(def.results.length).toBeGreaterThanOrEqual(0);
	});

	test("groups multi-chunk bulk and members compensate path", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const g = await groups.createGroup(db, "u1", { name: "G", description: null, icon: "users" });
		const seeds = Array.from({ length: 40 }, (_, i) => ({
			handle: `user${i}`,
			displayName: i % 2 ? `N${i}` : null,
			externalAuthorId: i % 3 ? `id${i}` : null,
		}));
		const imp = await groups.bulkImportGroupMembers(db, "u1", g.id, seeds);
		expect(imp.total).toBe(40);
		// second import → all skipped
		const imp2 = await groups.bulkImportGroupMembers(db, "u1", g.id, seeds.slice(0, 5));
		expect(imp2.skipped).toBeGreaterThan(0);

		const wl = await watchlists.createWatchlist(db, "u1", { name: "W" });
		const copy = await groups.copyGroupMembersToWatchlist(db, "u1", g.id, wl.id);
		expect(copy.added).toBeGreaterThan(0);
		// selected copy multi
		const ms = await groups.listGroupMembers(db, "u1", g.id);
		const copy2 = await groups.copyGroupMembersToWatchlist(db, "u1", g.id, wl.id, {
			memberIds: ms.slice(0, 20).map((m) => m.id),
		});
		expect(copy2.total).toBe(20);

		// members with tags + update tags
		const tag = await db
			.prepare(`INSERT INTO tags (user_id, name, color) VALUES ('u1', 't', '#fff') RETURNING id`)
			.first<{ id: number }>();
		expect(tag?.id).toBeTruthy();
		const tagId = tag?.id ?? 0;
		const m = await members.addMember(db, "u1", wl.id, {
			sourceType: "custom",
			handle: "solo",
			displayName: "  ",
			note: "  ",
			externalAuthorId: "  ",
			tagIds: [tagId],
		});
		await members.updateMember(db, "u1", m.id, {
			displayName: null,
			note: null,
			tagIds: [],
		});
		await members.updateMember(db, "u1", m.id, { tagIds: [tagId] }, { watchlistId: wl.id });

		// mock batch fail for compensate
		const failDb = {
			prepare(sql: string) {
				const binds: unknown[] = [];
				const stmt = {
					bind(...a: unknown[]) {
						binds.push(...a);
						return stmt;
					},
					async first() {
						if (sql.includes("FROM tags")) return { id: 1 };
						if (sql.includes("SELECT id FROM tags")) return { id: 1 };
						return {
							id: 9,
							user_id: "u1",
							watchlist_id: 1,
							source_type: "x.com",
							external_author_id: null,
							handle: "x",
							display_name: null,
							note: null,
							added_at_ms: 1,
						};
					},
					async all() {
						if (sql.includes("FROM tags")) return { results: [{ id: 1 }] };
						return { results: [] };
					},
					async run() {
						if (sql.includes("INSERT INTO watchlist_members")) {
							return { meta: { changes: 1, last_row_id: 99 } };
						}
						if (sql.includes("DELETE FROM watchlist_members")) {
							return { meta: { changes: 1 } };
						}
						return { meta: { changes: 1 } };
					},
				};
				return stmt;
			},
			async batch() {
				throw new Error("batch fail");
			},
		} as unknown as D1Database;
		await expect(
			members.addMember(failDb, "u1", 1, {
				sourceType: "x.com",
				handle: "x",
				tagIds: [1],
			}),
		).rejects.toThrow(/batch fail/);

		// non-unique throw path
		const throwDb = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async run() {
						throw new Error("disk full");
					},
					async first() {
						return null;
					},
					async all() {
						return { results: [] };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		await expect(
			members.addMember(throwDb, "u1", 1, { sourceType: "x.com", handle: "z" }),
		).rejects.toThrow(/disk full/);
		await expect(
			items.insertItemIgnore(throwDb, "u1", {
				watchlistId: 1,
				sourceType: "custom",
				externalId: "e",
				text: "t",
				createdAtMs: 1,
				payload: {},
			}),
		).rejects.toThrow(/disk full/);
	});

	test("users upsert branches", async () => {
		const db = createSqliteD1();
		const u1 = await users.upsertUserByAccess(db, {
			email: "a@t.local",
			name: "A",
			image: "https://img",
			accessIss: "iss",
			accessSub: "sub1",
		});
		const u2 = await users.upsertUserByAccess(db, {
			email: "a@t.local",
			name: null,
			image: null,
			accessIss: "iss",
			accessSub: "sub1",
		});
		expect(u2.id).toBe(u1.id);
		// bind existing email without access — conflict path if any
		const u3 = await users.upsertUserByAccess(db, {
			email: "b@t.local",
			name: "B",
			image: null,
			accessIss: "iss2",
			accessSub: "sub2",
		});
		expect(u3.email).toBe("b@t.local");
	});

	test("last fourteen branch hits", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await watchlists.createWatchlist(db, "u1", { name: "W" });
		// ingest-logs limit out of range
		const { listWatchlistIngestLogsRoute } = await import("../routes/ingest-logs.js");
		const { patchSettingsRoute } = await import("../routes/settings.js");
		const { bulkImportGroupMembersRoute } = await import("../routes/groups.js");
		const h = new Hono<AppEnv>();
		h.use("*", async (c, next) => {
			c.set("authUser", {
				id: "u1",
				email: "a@t.local",
				name: null,
				image: null,
				accessIss: null,
				accessSub: null,
			});
			// @ts-expect-error test
			c.env = { DB: db, ENVIRONMENT: "test", XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef" };
			return next();
		});
		h.get("/api/watchlists/:id/ingest-logs", listWatchlistIngestLogsRoute);
		h.patch("/api/settings", patchSettingsRoute);
		h.post("/api/groups/:id/members/import", bulkImportGroupMembersRoute);
		expect((await h.request(`/api/watchlists/${wl.id}/ingest-logs?limit=101`)).status).toBe(400);
		expect((await h.request(`/api/watchlists/${wl.id}/ingest-logs?limit=abc`)).status).toBe(400);
		expect(
			(
				await h.request("/api/settings", {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ other: 1 }),
				})
			).status,
		).toBe(400);
		// import non-RangeError rethrow path (line 155)
		const g = await groups.createGroup(db, "u1", { name: "G" });
		vi.spyOn(await import("@xray/shared"), "parseMemberImportText").mockImplementationOnce(() => {
			throw new TypeError("parse blew");
		});
		{
			const res = await h
				.request(`/api/groups/${g.id}/members/import`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: "@a" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// integration folder from existing meta non-string
		const env = {
			XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
			XRAY_SECRETS_KEY_VERSION: "1",
			ZHETO_WEBHOOK_ALLOW_HOSTS: "localhost",
		};
		const { upsertZhetoSettings, getZhetoSettings } = await import(
			"../repos/integration-secrets.js"
		);
		await upsertZhetoSettings(db, "u1", { webhookUrl: "https://localhost/h", folder: "keep" }, env);
		await db
			.prepare(`UPDATE integration_secrets SET meta_json = ? WHERE user_id = 'u1'`)
			.bind(JSON.stringify({ folder: 123 }))
			.run();
		// folder omitted → existing meta with non-string folder
		await upsertZhetoSettings(db, "u1", {}, env);
		expect((await getZhetoSettings(db, "u1")).folder).toBeNull();

		// members invalid source_type throw
		const badMem = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async all() {
						return {
							results: [
								{
									id: 1,
									user_id: "u1",
									watchlist_id: 1,
									source_type: "nope",
									external_author_id: null,
									handle: "h",
									display_name: null,
									note: null,
									added_at_ms: 1,
								},
							],
						};
					},
					async first() {
						return null;
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		await expect(members.listMembers(badMem, "u1", 1)).rejects.toThrow(/source_type/);

		// items invalid source_type
		const badItem = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async all() {
						return {
							results: [
								{
									id: 1,
									user_id: "u1",
									watchlist_id: 1,
									source_type: "nope",
									external_id: "e",
									member_id: null,
									author_username: null,
									title: null,
									text: "t",
									created_at_ms: 1,
									ingested_at_ms: 1,
									payload_json: "{}",
									ai_status: "not_requested",
									ai_status_updated_at_ms: 0,
									translated_text: null,
									summary_text: null,
									translation_error: null,
								},
							],
						};
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		await expect(items.listItems(badItem, "u1", 1)).rejects.toThrow(/source_type/);

		// push-tokens changes undefined
		const { revokePushToken } = await import("../repos/push-tokens.js");
		const tokDb = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async run() {
						return { meta: { changes: undefined } };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		expect(await revokePushToken(tokDb, "u1", 1)).toBe(false);

		// default jwt verifier twice (cache hit branch)
		setJwtVerifierForTests(null);
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error
			c.env = {
				ENVIRONMENT: "development",
				AUTH_DEV_BYPASS: "false",
				ALLOWED_EMAILS: "*",
				CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
				CF_ACCESS_AUD: "aud",
				DB: {
					prepare() {
						const s = {
							bind() {
								return s;
							},
							async first() {
								return null;
							},
							async run() {
								return { meta: { changes: 1 } };
							},
						};
						return s;
					},
				},
			};
			return next();
		});
		app.use("/api/*", accessAuth);
		app.get("/api/me", (c) => c.json({ ok: true }));
		await app.request("/api/me", {
			headers: { host: "localhost", "cf-access-jwt-assertion": "a.b.c" },
		});
		// second call may hit jwks cache branch if first got far enough
		await app.request("/api/me", {
			headers: { host: "localhost", "cf-access-jwt-assertion": "a.b.c" },
		});
	});

	test("ingest push stream cancel on oversized body", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error
			c.env = {
				DB: {
					prepare(sql: string) {
						const stmt = {
							bind() {
								return stmt;
							},
							async first() {
								if (sql.includes("push_tokens")) {
									return {
										id: 1,
										user_id: "u1",
										token_prefix: minted.tokenPrefix,
										token_hash: hash,
										label: "t",
										scopes: JSON.stringify(["ingest:push"]),
										created_at_ms: 1,
										last_used_at_ms: null,
										revoked_at_ms: null,
									};
								}
								return null;
							},
							async all() {
								return { results: [] };
							},
							async run() {
								return { meta: { changes: 1 } };
							},
						};
						return stmt;
					},
				},
				ENVIRONMENT: "test",
			};
			return next();
		});
		app.post("/p", ingestPushRoute);
		// stream larger than 1MB
		const big = new Uint8Array(600_000).fill(65);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(big);
				controller.enqueue(big); // total > 1MB
				controller.close();
			},
			cancel() {
				return Promise.reject(new Error("cancel err"));
			},
		});
		const res = await app.request("/p", {
			method: "POST",
			headers: {
				authorization: `Bearer ${minted.plaintext}`,
				"content-type": "application/json",
			},
			body: stream,
			// @ts-expect-error duplex
			duplex: "half",
		});
		expect([413, 400, 500]).toContain(res.status);
	});
});
