/**
 * Hit remaining route if/catch branches + repo ?? null sides via mocks.
 */
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as aiConfigs from "../repos/ai-configs.js";
import * as groupsRepo from "../repos/groups.js";
import * as itemsRepo from "../repos/items.js";
import * as membersRepo from "../repos/members.js";
import * as watchlistsRepo from "../repos/watchlists.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { putAiConfigRoute, testAiConfigRoute } from "./ai.js";
import {
	addGroupMemberRoute,
	bulkImportGroupMembersRoute,
	copyGroupToWatchlistRoute,
	deleteGroupRoute,
	getGroupRoute,
	listGroupMembersRoute,
	patchGroupRoute,
} from "./groups.js";
import { listItemsRoute } from "./items.js";
import { translateWatchlistRoute } from "./translate.js";
import {
	addMemberRoute,
	createTagRoute,
	deleteMemberRoute,
	deleteWatchlistRoute,
	listMembersRoute,
	patchMemberRoute,
	patchWatchlistRoute,
} from "./watchlists.js";
import { putZhetoSettingsRoute } from "./zheto.js";

const KEK = "0123456789abcdef0123456789abcdef";
const user = {
	id: "u1",
	email: "u@t.local",
	name: null,
	image: null,
	accessIss: null,
	accessSub: null,
};

function mount(
	routes: Array<[string, string, (c: never) => unknown]>,
	env: Record<string, unknown>,
) {
	const h = new Hono<AppEnv>();
	h.use("*", async (c, next) => {
		c.set("authUser", user);
		// @ts-expect-error test
		c.env = env;
		return next();
	});
	for (const [method, path, handler] of routes) {
		// @ts-expect-error handler
		h.on(method, path, handler);
	}
	return h;
}

describe("route null/error branches", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test("invalid ids on mutation methods", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const env = {
			DB: db,
			ENVIRONMENT: "test",
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
		};
		const h = mount(
			[
				["PATCH", "/api/groups/:id", patchGroupRoute],
				["DELETE", "/api/groups/:id", deleteGroupRoute],
				["GET", "/api/groups/:id/members", listGroupMembersRoute],
				["POST", "/api/groups/:id/members", addGroupMemberRoute],
				["POST", "/api/groups/:id/members/import", bulkImportGroupMembersRoute],
				["POST", "/api/groups/:id/copy-to-watchlist", copyGroupToWatchlistRoute],
				["GET", "/api/groups/:id", getGroupRoute],
				["PATCH", "/api/watchlists/:id", patchWatchlistRoute],
				["DELETE", "/api/watchlists/:id", deleteWatchlistRoute],
				["GET", "/api/watchlists/:id/members", listMembersRoute],
				["POST", "/api/watchlists/:id/members", addMemberRoute],
				["PATCH", "/api/watchlists/:id/members/:memberId", patchMemberRoute],
				["DELETE", "/api/watchlists/:id/members/:memberId", deleteMemberRoute],
				["GET", "/api/watchlists/:id/items", listItemsRoute],
				["POST", "/api/watchlists/:id/translate", translateWatchlistRoute],
			],
			env,
		);
		const badIds = ["0", "abc", "-1"];
		for (const id of badIds) {
			expect(
				(
					await h.request(`/api/groups/${id}`, {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ name: "x" }),
					})
				).status,
			).toBe(400);
			expect((await h.request(`/api/groups/${id}`, { method: "DELETE" })).status).toBe(400);
			expect((await h.request(`/api/groups/${id}/members`)).status).toBe(400);
			expect(
				(
					await h.request(`/api/groups/${id}/members`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
					})
				).status,
			).toBe(400);
			expect(
				(
					await h.request(`/api/groups/${id}/members/import`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ text: "@a" }),
					})
				).status,
			).toBe(400);
			expect(
				(
					await h.request(`/api/groups/${id}/copy-to-watchlist`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ watchlistId: 1 }),
					})
				).status,
			).toBe(400);
			expect(
				(
					await h.request(`/api/watchlists/${id}`, {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ name: "x" }),
					})
				).status,
			).toBe(400);
			expect((await h.request(`/api/watchlists/${id}`, { method: "DELETE" })).status).toBe(400);
			expect((await h.request(`/api/watchlists/${id}/members`)).status).toBe(400);
			expect(
				(
					await h.request(`/api/watchlists/${id}/members`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
					})
				).status,
			).toBe(400);
			expect(
				(
					await h.request(`/api/watchlists/${id}/members/1`, {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ note: "n" }),
					})
				).status,
			).toBe(400);
			expect(
				(await h.request(`/api/watchlists/${id}/members/1`, { method: "DELETE" })).status,
			).toBe(400);
			expect((await h.request(`/api/watchlists/${id}/items`)).status).toBe(400);
			expect(
				(
					await h.request(`/api/watchlists/${id}/translate`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					})
				).status,
			).toBe(400);
		}
	});

	test("group member catch paths and import RangeError", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const g = await groupsRepo.createGroup(db, "u1", { name: "G" });
		const env = {
			DB: db,
			ENVIRONMENT: "test",
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
		};
		const h = mount(
			[
				["POST", "/api/groups/:id/members", addGroupMemberRoute],
				["POST", "/api/groups/:id/members/import", bulkImportGroupMembersRoute],
				["POST", "/api/groups/:id/copy-to-watchlist", copyGroupToWatchlistRoute],
				["POST", "/api/watchlists/:id/members", addMemberRoute],
				["POST", "/api/tags", createTagRoute],
			],
			env,
		);

		// invalid sourceType after parse
		expect(
			(
				await h.request(`/api/groups/${g.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "not-a-source", handle: "a" }),
				})
			).status,
		).toBe(400);

		// handle required from repo (normalize strips to empty)
		vi.spyOn(groupsRepo, "addGroupMember").mockRejectedValueOnce(new Error("handle required"));
		expect(
			(
				await h.request(`/api/groups/${g.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "x.com", handle: "okhandle" }),
				})
			).status,
		).toBe(400);

		// non-Error throw → rethrow (hono may surface as error)
		vi.spyOn(groupsRepo, "addGroupMember").mockRejectedValueOnce("string-err");
		{
			const res = await h
				.request(`/api/groups/${g.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "x.com", handle: "okhandle" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// generic Error rethrow
		vi.spyOn(groupsRepo, "addGroupMember").mockRejectedValueOnce(new Error("other boom"));
		{
			const res = await h
				.request(`/api/groups/${g.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "x.com", handle: "okhandle" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// import RangeError via >500 seeds
		const handles = Array.from({ length: 501 }, (_, i) => `@u${i}`).join("\n");
		expect(
			(
				await h.request(`/api/groups/${g.id}/members/import`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: handles }),
				})
			).status,
		).toBe(400);

		// import non-RangeError rethrow
		vi.spyOn(groupsRepo, "bulkImportGroupMembers").mockRejectedValueOnce(new Error("db"));
		{
			const res = await h
				.request(`/api/groups/${g.id}/members/import`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: "@abc" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// copy GroupCopyLimitError
		vi.spyOn(groupsRepo, "copyGroupMembersToWatchlist").mockRejectedValueOnce(
			new groupsRepo.GroupCopyLimitError("too many"),
		);
		expect(
			(
				await h.request(`/api/groups/${g.id}/copy-to-watchlist`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ watchlistId: 1 }),
				})
			).status,
		).toBe(400);

		// copy other error rethrow
		vi.spyOn(groupsRepo, "copyGroupMembersToWatchlist").mockRejectedValueOnce(new Error("x"));
		{
			const res = await h
				.request(`/api/groups/${g.id}/copy-to-watchlist`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ watchlistId: 1 }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// copy body null
		expect(
			(
				await h.request(`/api/groups/${g.id}/copy-to-watchlist`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{bad",
				})
			).status,
		).toBe(400);

		// watchlist invalid sourceType
		const wl = await watchlistsRepo.createWatchlist(db, "u1", { name: "W" });
		expect(
			(
				await h.request(`/api/watchlists/${wl.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "nope", handle: "a" }),
				})
			).status,
		).toBe(400);

		// member validation + conflict + rethrow
		vi.spyOn(membersRepo, "addMember").mockRejectedValueOnce(
			new membersRepo.MemberValidationError("bad tags"),
		);
		expect(
			(
				await h.request(`/api/watchlists/${wl.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
				})
			).status,
		).toBe(400);
		vi.spyOn(membersRepo, "addMember").mockRejectedValueOnce(
			new membersRepo.MemberConflictError("exists"),
		);
		expect(
			(
				await h.request(`/api/watchlists/${wl.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
				})
			).status,
		).toBe(409);
		vi.spyOn(membersRepo, "addMember").mockRejectedValueOnce(new Error("other"));
		{
			const res = await h
				.request(`/api/watchlists/${wl.id}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// tag unique
		await h.request("/api/tags", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "t1" }),
		});
		expect(
			(
				await h.request("/api/tags", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "t1" }),
				})
			).status,
		).toBe(409);
	});

	test("ai/zheto/translate remaining catch branches", { timeout: 15_000 }, async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await watchlistsRepo.createWatchlist(db, "u1", { name: "W" });
		const env = {
			DB: db,
			ENVIRONMENT: "test",
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
		};
		const h = mount(
			[
				["PUT", "/api/ai-config", putAiConfigRoute],
				["POST", "/api/ai-config/test", testAiConfigRoute],
				["PUT", "/api/integrations/zheto", putZhetoSettingsRoute],
				["POST", "/api/watchlists/:id/translate", translateWatchlistRoute],
				["GET", "/api/watchlists/:id/items", listItemsRoute],
			],
			env,
		);

		// AiConfigValidationError
		vi.spyOn(aiConfigs, "upsertAiConfig").mockRejectedValueOnce(
			new aiConfigs.AiConfigValidationError("bad"),
		);
		expect(
			(
				await h.request("/api/ai-config", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: "openai", apiKey: "sk" }),
				})
			).status,
		).toBe(400);

		// KEK generic error (not missing/32 bytes)
		vi.spyOn(aiConfigs, "upsertAiConfig").mockRejectedValueOnce(new Error("KEK rotate failed"));
		expect(
			(
				await h.request("/api/ai-config", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: "openai", apiKey: "sk" }),
				})
			).status,
		).toBe(500);

		// non-Error rethrow
		vi.spyOn(aiConfigs, "upsertAiConfig").mockRejectedValueOnce("x");
		{
			const res = await h
				.request("/api/ai-config", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: "openai", apiKey: "sk" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// save real config for decrypt tests
		await aiConfigs.upsertAiConfig(
			db,
			"u1",
			{ provider: "openai", model: "m", apiKey: "sk-real", baseUrl: "https://api.openai.com/v1" },
			env,
		);

		// decrypt fail on test
		vi.spyOn(aiConfigs, "decryptAiApiKey").mockRejectedValueOnce(new Error("bad"));
		expect(
			(
				await h.request("/api/ai-config/test", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}",
				})
			).status,
		).toBe(500);

		// test with array body → draft {} (falls back to saved config)
		expect(
			(
				await h.request("/api/ai-config/test", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "[]",
				})
			).status,
		).toBeLessThan(500);

		// restore decrypt, test timeout/abort and non-Error catch
		vi.spyOn(aiConfigs, "decryptAiApiKey").mockResolvedValue({ apiKey: "sk", keks: [] });
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_u: string, init?: RequestInit) => {
				const err = new Error("aborted");
				// simulate abort
				if (init?.signal) {
					await new Promise((_, rej) => {
						init.signal?.addEventListener("abort", () => rej(err));
					});
				}
				throw err;
			}),
		);
		// short timeout by advancing - actually 12s is long. Throw non-abort instead:
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw "string-fail";
			}),
		);
		expect(
			(
				await h.request("/api/ai-config/test", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ apiKey: "sk", provider: "openai" }),
				})
			).status,
		).toBe(200);

		// abort message → timeout
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("The operation was aborted");
			}),
		);
		expect(
			(
				await h.request("/api/ai-config/test", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ apiKey: "sk", provider: "openai" }),
				})
			).status,
		).toBe(200);

		// model empty string with Object.hasOwn
		expect(
			(
				await h.request("/api/ai-config/test", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						provider: "openai",
						apiKey: "sk",
						model: "",
						baseUrl: 123,
					}),
				})
			).status,
		).toBe(200);

		// zheto KEK generic
		const zhetoMod = await import("../repos/integration-secrets.js");
		vi.spyOn(zhetoMod, "upsertZhetoSettings").mockRejectedValueOnce(new Error("KEK weird"));
		expect(
			(
				await h.request("/api/integrations/zheto", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ webhookUrl: "https://localhost/h" }),
				})
			).status,
		).toBe(500);
		vi.spyOn(zhetoMod, "upsertZhetoSettings").mockRejectedValueOnce("x");
		{
			const res = await h
				.request("/api/integrations/zheto", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ webhookUrl: "https://localhost/h" }),
				})
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// translate decrypt fail
		vi.spyOn(aiConfigs, "getAiConfigRow").mockResolvedValue({
			user_id: "u1",
			provider: "openai",
			model: "m",
			base_url: null,
			api_key_ciphertext: new ArrayBuffer(8),
			api_key_key_version: 1,
			translation_prompt: null,
			summary_prompt: null,
			updated_at_ms: 1,
		});
		vi.spyOn(aiConfigs, "decryptAiApiKey").mockRejectedValueOnce(new Error("dec"));
		expect(
			(
				await h.request(`/api/watchlists/${wl.id}/translate`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}",
				})
			).status,
		).toBe(500);

		// items invalid cursor via real ItemCursorError
		expect((await h.request(`/api/watchlists/${wl.id}/items?cursor=%%%`)).status).toBe(400);
		// items non-cursor error rethrow
		vi.spyOn(itemsRepo, "listItems").mockRejectedValueOnce(new Error("boom"));
		{
			const res = await h
				.request(`/api/watchlists/${wl.id}/items`)
				.catch(() => new Response(null, { status: 500 }));
			expect(res.status).toBeGreaterThanOrEqual(500);
		}

		// json catch on translate body
		expect(
			(
				await h.request(`/api/watchlists/${wl.id}/translate`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{bad",
				})
			).status,
		).toBeLessThan(500);
	});

	test("repo nullish sides via mock DB", async () => {
		const nullResults = {
			prepare(sql: string) {
				const stmt = {
					bind() {
						return stmt;
					},
					async first() {
						if (sql.includes("INSERT") || sql.includes("RETURNING")) return null;
						return null;
					},
					async all() {
						return { results: null };
					},
					async run() {
						return { meta: { changes: undefined, last_row_id: 1 } };
					},
				};
				return stmt;
			},
			async batch(stmts: unknown[]) {
				return (stmts as unknown[]).map(() => ({ meta: undefined }));
			},
		} as unknown as D1Database;

		expect(await groupsRepo.listGroups(nullResults, "u1")).toEqual([]);
		expect(await groupsRepo.listGroupMembers(nullResults, "u1", 1)).toEqual([]);
		expect(await groupsRepo.deleteGroup(nullResults, "u1", 1)).toBe(false);
		expect(await groupsRepo.deleteGroupMember(nullResults, "u1", 1)).toBe(false);
		expect(await watchlistsRepo.listWatchlists(nullResults, "u1")).toEqual([]);
		expect(await watchlistsRepo.deleteWatchlist(nullResults, "u1", 1)).toBe(false);
		expect(await membersRepo.listMembers(nullResults, "u1", 1)).toEqual([]);
		expect(await membersRepo.deleteMember(nullResults, "u1", 1)).toBe(false);
		expect(await itemsRepo.deleteItem(nullResults, "u1", 1)).toBe(false);

		// createGroup fails to reload
		await expect(groupsRepo.createGroup(nullResults, "u1", { name: "G" })).rejects.toThrow(
			/failed to load group/,
		);

		// addGroupMember handle required
		const real = createSqliteD1();
		await real
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const g = await groupsRepo.createGroup(real, "u1", { name: "G" });
		await expect(
			groupsRepo.addGroupMember(real, "u1", g.id, { sourceType: "x.com", handle: "" }),
		).rejects.toThrow(/handle/);

		// updateGroup icon empty → users
		await groupsRepo.updateGroup(real, "u1", g.id, { icon: "   " });
		await groupsRepo.updateGroup(real, "u1", g.id, { name: "G2" });
		await groupsRepo.updateGroup(real, "u1", g.id, { description: "  " });
		await groupsRepo.updateGroup(real, "u1", g.id, { description: null });

		// invalid source_type in list (mock row)
		const badSrc = {
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
									group_id: 1,
									source_type: "badtype",
									external_author_id: null,
									handle: "h",
									display_name: null,
									added_at_ms: 1,
								},
							],
						};
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		await expect(groupsRepo.listGroupMembers(badSrc, "u1", 1)).rejects.toThrow(/source_type/);

		// addGroupMember row missing after insert
		const noRow = {
			prepare(_sql: string) {
				const stmt = {
					bind() {
						return stmt;
					},
					async first() {
						return null;
					},
					async run() {
						return { meta: { last_row_id: 5, changes: 1 } };
					},
					async all() {
						return { results: [] };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		await expect(
			groupsRepo.addGroupMember(noRow, "u1", 1, { sourceType: "x.com", handle: "abc" }),
		).rejects.toThrow(/failed to load group member/);

		// bulk batch null meta
		const batchNull = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async first() {
						return {
							id: 1,
							user_id: "u1",
							name: "G",
							description: null,
							icon: "users",
							created_at_ms: 1,
							member_count: 0,
						};
					},
					async run() {
						return { meta: { changes: undefined } };
					},
					async all() {
						return { results: [] };
					},
				};
				return stmt;
			},
			async batch() {
				return [{ meta: undefined }, { meta: { changes: undefined } }];
			},
		} as unknown as D1Database;
		await groupsRepo.bulkImportGroupMembers(batchNull, "u1", 1, [{ handle: "a" }, { handle: "b" }]);

		// copy full with null count/changes
		const copyNull = {
			prepare(sql: string) {
				const stmt = {
					bind() {
						return stmt;
					},
					async first() {
						if (sql.includes("FROM watchlists")) return { id: 1 };
						if (sql.includes("FROM groups")) {
							return {
								id: 1,
								user_id: "u1",
								name: "G",
								description: null,
								icon: "users",
								created_at_ms: 1,
								member_count: 0,
							};
						}
						// bare COUNT on group_members (full-copy path)
						if (sql.includes("COUNT(*)") && sql.includes("group_members")) return null;
						return null;
					},
					async run() {
						return { meta: undefined };
					},
					async all() {
						return {
							results: [
								{
									id: 1,
									user_id: "u1",
									group_id: 1,
									source_type: "x.com",
									external_author_id: null,
									handle: "h1",
									display_name: null,
									added_at_ms: 1,
								},
							],
						};
					},
				};
				return stmt;
			},
			async batch() {
				return [{ meta: undefined }];
			},
		} as unknown as D1Database;
		// total 0 from null count
		const r = await groupsRepo.copyGroupMembersToWatchlist(copyNull, "u1", 1, 1);
		expect(r.total).toBe(0);

		// selected copy with batch null
		await groupsRepo.copyGroupMembersToWatchlist(copyNull, "u1", 1, 1, { memberIds: [1] });

		// items insert changes 0 → deduped without throw
		const dedupeDb = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async run() {
						return { meta: { changes: 0 } };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		expect(
			await itemsRepo.insertItemIgnore(dedupeDb, "u1", {
				watchlistId: 1,
				sourceType: "custom",
				externalId: "e",
				text: "t",
				createdAtMs: 1,
				payload: null,
			}),
		).toBe("deduped");

		// members update missing after batch
		let memSelects = 0;
		const memGone = {
			prepare(sql: string) {
				const stmt = {
					bind() {
						return stmt;
					},
					async first() {
						if (sql.includes("SELECT * FROM watchlist_members")) {
							memSelects += 1;
							if (memSelects === 1) {
								return {
									id: 1,
									user_id: "u1",
									watchlist_id: 1,
									source_type: "x.com",
									external_author_id: null,
									handle: "h",
									display_name: "d",
									note: "n",
									added_at_ms: 1,
								};
							}
							return null;
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
			async batch() {
				return [];
			},
		} as unknown as D1Database;
		expect(await membersRepo.updateMember(memGone, "u1", 1, { note: "x" })).toBeNull();

		// watchlist create fail reload
		await expect(watchlistsRepo.createWatchlist(nullResults, "u1", { name: "W" })).rejects.toThrow(
			/failed to load/,
		);

		// integration secrets no allowHosts → ZHETO_URL_RE path
		const { assertZhetoWebhookUrl } = await import("../repos/integration-secrets.js");
		expect(() => assertZhetoWebhookUrl("https://evil.com/x")).toThrow();
		assertZhetoWebhookUrl("https://zhe.to/api/webhook/abc");
		assertZhetoWebhookUrl("https://zhe.to/api/link/create/d64e9289-ae8a-417f-9d0a-0daccdc1e3ee");
	});
});
