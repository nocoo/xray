/**
 * Mock-DB hits for nullish coalescing / empty-result branches hard to reach on real SQLite.
 */
import { describe, expect, test } from "vitest";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import * as aiConfigs from "./ai-configs.js";
import * as dashboard from "./dashboard.js";
import * as groups from "./groups.js";
import * as ingestLogs from "./ingest-logs.js";
import * as integrationSecrets from "./integration-secrets.js";
import * as members from "./members.js";
import * as pushTokens from "./push-tokens.js";
import * as settings from "./settings.js";
import * as tags from "./tags.js";
import * as watchlists from "./watchlists.js";

function mockDb(handlers: {
	first?: (sql: string) => unknown;
	all?: (sql: string) => unknown[];
	run?: (sql: string) => { changes?: number; last_row_id?: number };
	batch?: () => Array<{ meta?: { changes?: number } }>;
}): D1Database {
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first() {
					return handlers.first?.(sql) ?? null;
				},
				async all() {
					return { results: handlers.all?.(sql) ?? null };
				},
				async run() {
					const r = handlers.run?.(sql) ?? {};
					return { meta: { changes: r.changes ?? 0, last_row_id: r.last_row_id ?? 0 } };
				},
			};
			return stmt;
		},
		async batch() {
			return handlers.batch?.() ?? [];
		},
	} as unknown as D1Database;
}

describe("nullish / edge repo branches", () => {
	test("dashboard null counts and empty bySource", async () => {
		const db = mockDb({
			first: () => null,
			all: () => null as unknown as unknown[],
		});
		// listRecentIngestLogs also uses all
		const d = await dashboard.getDashboardAggregates(db, "u1", Date.now());
		expect(d.watchlistCount).toBe(0);
		expect(d.groupCount).toBe(0);
		expect(d.memberCount).toBe(0);
		expect(d.items24h).toBe(0);
		expect(d.pendingAi).toBe(0);
		expect(d.bySourceType).toEqual([]);
	});

	test("ingest logs clampLimit and null results", async () => {
		const db = mockDb({ all: () => null as unknown as unknown[] });
		expect(await ingestLogs.listIngestLogsForWatchlist(db, "u1", 1, Number.NaN)).toEqual([]);
		expect(await ingestLogs.listIngestLogsForWatchlist(db, "u1", 1, 0)).toEqual([]);
		expect(await ingestLogs.listIngestLogsForWatchlist(db, "u1", 1, 999)).toEqual([]);
		expect(await ingestLogs.listRecentIngestLogs(db, "u1", Number.NaN)).toEqual([]);
		expect(await ingestLogs.listRecentIngestLogs(db, "u1", -1)).toEqual([]);
	});

	test("tags null results and empty color default", async () => {
		const db = mockDb({
			all: () => null as unknown as unknown[],
			run: () => ({ last_row_id: 7, changes: 1 }),
			first: () => null,
		});
		expect(await tags.listTags(db, "u1")).toEqual([]);
		const t = await tags.createTag(db, "u1", "  n  ", "   ");
		expect(t.color).toContain("hsl");
		expect(t.id).toBe(7);
	});

	test("push tokens scopes parse branches and null results", async () => {
		const rows = [
			{
				id: 1,
				user_id: "u1",
				token_prefix: "p",
				token_hash: "h",
				label: "a",
				scopes: "not-json",
				created_at_ms: 1,
				last_used_at_ms: null,
				revoked_at_ms: null,
			},
			{
				id: 2,
				user_id: "u1",
				token_prefix: "p2",
				token_hash: "h2",
				label: "b",
				scopes: JSON.stringify({ x: 1 }),
				created_at_ms: 2,
				last_used_at_ms: 3,
				revoked_at_ms: null,
			},
			{
				id: 3,
				user_id: "u1",
				token_prefix: "p3",
				token_hash: "h3",
				label: "c",
				scopes: JSON.stringify(["a", 1]),
				created_at_ms: 3,
				last_used_at_ms: null,
				revoked_at_ms: null,
			},
		];
		const db = mockDb({
			all: () => rows,
			run: () => ({ changes: 0 }),
		});
		const list = await pushTokens.listPushTokens(db, "u1");
		expect(list[0]?.scopes).toEqual(["ingest:push"]);
		expect(list[1]?.scopes).toEqual(["ingest:push"]);
		expect(list[2]?.scopes).toEqual(["a", "1"]);
		expect(await pushTokens.revokePushToken(db, "u1", 1)).toBe(false);

		const empty = mockDb({ all: () => null as unknown as unknown[] });
		expect(await pushTokens.listPushTokens(empty, "u1")).toEqual([]);
	});

	test("settings non-finite window hours", async () => {
		const db = mockDb({
			first: () => ({ value: "not-a-number" }),
		});
		expect(await settings.getWindowHours(db, "u1")).toBe(24);
	});

	test("watchlists update partial fields and delete changes null", async () => {
		const real = createSqliteD1();
		await real
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await watchlists.createWatchlist(real, "u1", {
			name: "W",
			description: "d",
			icon: "eye",
			translateEnabled: true,
		});
		await watchlists.updateWatchlist(real, "u1", wl.id, { description: "  " });
		await watchlists.updateWatchlist(real, "u1", wl.id, { icon: "  " });
		await watchlists.updateWatchlist(real, "u1", wl.id, { translateEnabled: false });
		await watchlists.updateWatchlist(real, "u1", wl.id, { name: " W2 " });
		const mock = mockDb({ run: () => ({ changes: undefined }) });
		expect(await watchlists.deleteWatchlist(mock, "u1", 1)).toBe(false);
	});

	test("groups copy limit and empty full copy", async () => {
		const real = createSqliteD1();
		await real
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const g = await groups.createGroup(real, "u1", { name: "G" });
		const wl = await watchlists.createWatchlist(real, "u1", {
			name: "W",
			translateEnabled: false,
		});
		// empty group full copy
		const empty = await groups.copyGroupMembersToWatchlist(real, "u1", g.id, wl.id);
		expect(empty.total).toBe(0);

		// GroupCopyLimitError via mock count
		const limitDb = mockDb({
			first: (sql) => {
				if (sql.includes("FROM groups") || sql.includes("FROM watchlists")) return { id: 1 };
				if (sql.includes("COUNT(*)")) return { c: groups.GROUP_COPY_MAX + 1 };
				return { id: 1, name: "G", description: null, icon: "users", created_at_ms: 1 };
			},
			all: () => [],
		});
		// getGroup needs a proper row shape
		const limitDb2 = {
			prepare(sql: string) {
				const stmt = {
					bind() {
						return stmt;
					},
					async first() {
						if (sql.includes("COUNT(*)")) return { c: groups.GROUP_COPY_MAX + 1 };
						if (sql.includes("FROM watchlists")) return { id: 1 };
						// getGroup SELECT *
						return {
							id: 1,
							user_id: "u1",
							name: "G",
							description: null,
							icon: "users",
							created_at_ms: 1,
							member_count: groups.GROUP_COPY_MAX + 1,
						};
					},
					async all() {
						// selected copy with too many members
						if (sql.includes("FROM group_members")) {
							return {
								results: Array.from({ length: groups.GROUP_COPY_MAX + 1 }, (_, i) => ({
									id: i + 1,
									user_id: "u1",
									group_id: 1,
									source_type: "x.com",
									external_author_id: null,
									handle: `h${i}`,
									display_name: null,
									added_at_ms: 1,
								})),
							};
						}
						return { results: [] };
					},
					async run() {
						return { meta: { changes: 0 } };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;

		await expect(groups.copyGroupMembersToWatchlist(limitDb2, "u1", 1, 1)).rejects.toBeInstanceOf(
			groups.GroupCopyLimitError,
		);

		await expect(
			groups.copyGroupMembersToWatchlist(limitDb2, "u1", 1, 1, {
				memberIds: Array.from({ length: groups.GROUP_COPY_MAX + 1 }, (_, i) => i + 1),
			}),
		).rejects.toBeInstanceOf(groups.GroupCopyLimitError);

		// delete without groupId opt
		await groups.addGroupMember(real, "u1", g.id, { sourceType: "x.com", handle: "z1" });
		const listed = await groups.listGroupMembers(real, "u1", g.id);
		expect(await groups.deleteGroupMember(real, "u1", listed[0]?.id)).toBe(true);

		// constructors
		expect(new groups.GroupCopyLimitError("x").name).toBe("GroupCopyLimitError");
		expect(new groups.GroupNotFoundError().name).toBe("GroupNotFoundError");
		expect(limitDb).toBeTruthy();
	});

	test("members delete without watchlistId and invalid source type throw", async () => {
		const real = createSqliteD1();
		await real
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await watchlists.createWatchlist(real, "u1", { name: "W" });
		const m = await members.addMember(real, "u1", wl.id, {
			sourceType: "x.com",
			handle: "m1",
		});
		expect(await members.deleteMember(real, "u1", m.id)).toBe(true);
		expect(await members.updateMember(real, "u1", 999, { note: "x" })).toBeNull();

		// empty handle validation
		await expect(
			members.addMember(real, "u1", wl.id, { sourceType: "x.com", handle: "  " }),
		).rejects.toBeInstanceOf(members.MemberValidationError);
	});

	test("integration secrets bad meta_json and folder-only paths", async () => {
		const env = {
			XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
			XRAY_SECRETS_KEY_VERSION: "1",
			ZHETO_WEBHOOK_ALLOW_HOSTS: "localhost",
		};
		const real = createSqliteD1();
		await real
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		await integrationSecrets.upsertZhetoSettings(
			real,
			"u1",
			{ webhookUrl: "https://localhost/h", folder: "f" },
			env,
		);
		// corrupt meta
		await real
			.prepare(`UPDATE integration_secrets SET meta_json = 'not-json' WHERE user_id = 'u1'`)
			.run();
		const pub = await integrationSecrets.getZhetoSettings(real, "u1");
		expect(pub.folder).toBeNull();
		const dec = await integrationSecrets.decryptZhetoWebhookUrl(real, "u1", env);
		expect(dec?.folder).toBeNull();
		// folder-only update reads bad meta then overwrites
		await integrationSecrets.upsertZhetoSettings(real, "u1", { folder: "  " }, env);
		// webhookUrl required when no existing
		await expect(
			integrationSecrets.upsertZhetoSettings(real, "u2", { folder: "x" }, env),
		).rejects.toBeInstanceOf(integrationSecrets.IntegrationValidationError);
		// invalid URL with allowHosts
		expect(() =>
			integrationSecrets.assertZhetoWebhookUrl("https://not a url", ["localhost"]),
		).toThrow();
	});

	test("ai-configs keep-key and validation errors", async () => {
		const env = {
			XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
			XRAY_SECRETS_KEY_VERSION: "1",
		};
		const real = createSqliteD1();
		await real
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'a@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		await expect(
			aiConfigs.upsertAiConfig(real, "u1", { provider: "openai" }, env),
		).rejects.toBeInstanceOf(aiConfigs.AiConfigValidationError);
		await aiConfigs.upsertAiConfig(
			real,
			"u1",
			{
				provider: "openai",
				model: "m",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "sk",
			},
			env,
		);
		await expect(
			aiConfigs.upsertAiConfig(
				real,
				"u1",
				{ provider: "openai", baseUrl: "http://localhost" },
				env,
			),
		).rejects.toBeInstanceOf(aiConfigs.AiConfigValidationError);
		expect(await aiConfigs.getAiConfig(real, "missing")).toBeNull();
	});
});
