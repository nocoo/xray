/**
 * Direct repo exercises on real schema (node:sqlite D1 shim).
 */
import { describe, expect, test } from "vitest";
import { mintPushToken, sha256Hex } from "../lib/push-token-crypto.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import * as aiConfigs from "./ai-configs.js";
import * as dashboard from "./dashboard.js";
import * as groups from "./groups.js";
import * as ingestLogs from "./ingest-logs.js";
import * as integrationSecrets from "./integration-secrets.js";
import * as items from "./items.js";
import * as members from "./members.js";
import * as pushTokens from "./push-tokens.js";
import * as settings from "./settings.js";
import * as tags from "./tags.js";
import * as translate from "./translate.js";
import * as users from "./users.js";
import * as watchlists from "./watchlists.js";

const env = {
	XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
	XRAY_SECRETS_KEY_VERSION: "1",
	ZHETO_WEBHOOK_ALLOW_HOSTS: "localhost",
};

async function seed(db: D1Database, id: string, email: string) {
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
		)
		.bind(id, email, "n", "iss", `sub-${id}`, now)
		.run();
}

describe("sqlite repos coverage", () => {
	test("full repo surface", async () => {
		const db = createSqliteD1();
		await seed(db, "u1", "u1@t.local");
		await seed(db, "u2", "u2@t.local");

		const wl = await watchlists.createWatchlist(db, "u1", {
			name: "W",
			description: "d",
			icon: "eye",
			translateEnabled: true,
		});
		expect((await watchlists.listWatchlists(db, "u1")).length).toBe(1);
		expect(await watchlists.getWatchlist(db, "u1", wl.id)).toBeTruthy();
		expect(await watchlists.getWatchlist(db, "u2", wl.id)).toBeNull();
		await watchlists.updateWatchlist(db, "u1", wl.id, {
			name: "W2",
			description: null,
			icon: "brain",
			translateEnabled: false,
		});
		expect(await watchlists.updateWatchlist(db, "u2", wl.id, { name: "x" })).toBeNull();

		const tag = await tags.createTag(db, "u1", "t", "#fff");
		expect((await tags.listTags(db, "u1")).length).toBe(1);
		expect((await tags.findOrCreateTag(db, "u1", "t", "#000")).id).toBe(tag.id);
		await tags.findOrCreateTag(db, "u1", "tnew", "#111");

		const m = await members.addMember(db, "u1", wl.id, {
			sourceType: "x.com",
			handle: "alice",
			displayName: "A",
			note: "n",
			tagIds: [tag.id],
		});
		expect((await members.listMembers(db, "u1", wl.id)).length).toBe(1);
		await members.updateMember(db, "u1", wl.id, m.id, {
			note: "n2",
			displayName: "A2",
			tagIds: [],
		});
		expect(await members.updateMember(db, "u2", wl.id, m.id, { note: "x" })).toBeNull();

		const g = await groups.createGroup(db, "u1", { name: "G", icon: "users" });
		expect((await groups.listGroups(db, "u1")).length).toBe(1);
		expect(await groups.getGroup(db, "u1", g.id)).toBeTruthy();
		await groups.updateGroup(db, "u1", g.id, { name: "G2", description: "d" });
		const gm = await groups.addGroupMember(db, "u1", g.id, {
			sourceType: "custom",
			handle: "c1",
		});
		expect((await groups.listGroupMembers(db, "u1", g.id)).length).toBe(1);
		const imp = await groups.bulkImportGroupMembers(db, "u1", g.id, [
			{ handle: "x" },
			{ handle: "y" },
			{ handle: "" },
		]);
		expect(imp.added + imp.skipped).toBeGreaterThanOrEqual(2);
		const copy = await groups.copyGroupMembersToWatchlist(db, "u1", g.id, wl.id);
		expect(copy.added + copy.skipped).toBeGreaterThan(0);
		await groups.deleteGroupMember(db, "u1", gm.id, { groupId: g.id });
		expect(await groups.deleteGroupMember(db, "u1", 99999, { groupId: g.id })).toBe(false);

		const minted = await mintPushToken();
		const tok = await pushTokens.createPushToken(
			db,
			"u1",
			"lab",
			minted.tokenPrefix,
			minted.tokenHash,
		);
		expect((await pushTokens.listPushTokens(db, "u1")).length).toBe(1);
		expect(await pushTokens.findActiveTokenByHash(db, minted.tokenHash)).toBeTruthy();
		await pushTokens.touchPushToken(db, tok.id);
		expect(await pushTokens.findActiveTokenByHash(db, await sha256Hex("nope"))).toBeNull();

		const now = Date.now();
		expect(
			await items.insertItemIgnore(db, "u1", {
				watchlistId: wl.id,
				sourceType: "custom",
				externalId: "e1",
				memberId: m.id,
				authorUsername: "a",
				title: "t",
				text: "hello",
				createdAtMs: now,
				payload: { body: { kind: "custom", text: "hello" } },
			}),
		).toBe("accepted");
		expect(
			await items.insertItemIgnore(db, "u1", {
				watchlistId: wl.id,
				sourceType: "custom",
				externalId: "e1",
				text: "hello",
				createdAtMs: now,
				payload: {},
			}),
		).toBe("deduped");

		const listed = await items.listItems(db, "u1", wl.id, { limit: 10 });
		expect(listed.items.length).toBeGreaterThanOrEqual(1);
		await items.listItems(db, "u1", wl.id, { limit: 5, sourceType: "custom" });
		const cur = items.encodeItemCursor(listed.items[0]?.createdAtMs, listed.items[0]?.id);
		expect(items.decodeItemCursor(cur)).toBeTruthy();
		expect(items.decodeItemCursor("bad")).toBeNull();
		await items.listItems(db, "u1", wl.id, { limit: 5, cursor: cur });
		const itemId = listed.items[0]?.id;

		await items.insertItemIgnore(db, "u1", {
			watchlistId: wl.id,
			sourceType: "custom",
			externalId: "e2",
			text: "to translate",
			createdAtMs: Date.now(),
			payload: {},
		});

		await db
			.prepare(
				`INSERT INTO ingest_logs (user_id, watchlist_id, attempted, accepted, deduped, rejected, errors_json, created_at_ms)
         VALUES (?, ?, 1, 1, 0, 0, NULL, ?)`,
			)
			.bind("u1", wl.id, Date.now())
			.run();
		expect((await ingestLogs.listIngestLogsForWatchlist(db, "u1", wl.id, 10)).length).toBe(1);
		expect((await ingestLogs.listRecentIngestLogs(db, "u1", 5)).length).toBe(1);

		await settings.setSetting(db, "u1", "ingest.windowHours", "36");
		expect(await settings.getWindowHours(db, "u1")).toBe(36);
		expect(await settings.getSetting(db, "u1", "ingest.windowHours")).toBe("36");

		const dash = await dashboard.getDashboardAggregates(db, "u1");
		expect(dash.watchlistCount).toBeGreaterThanOrEqual(1);

		await aiConfigs.upsertAiConfig(
			db,
			"u1",
			{
				provider: "openai",
				model: "m",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "sk-x",
				translationPrompt: "t",
				summaryPrompt: "s",
			},
			env,
		);
		expect((await aiConfigs.getAiConfig(db, "u1"))?.hasApiKey).toBe(true);
		const rowAi = await aiConfigs.getAiConfigRow(db, "u1");
		expect(rowAi).toBeTruthy();
		if (!rowAi) throw new Error("ai config missing");
		const dec = await aiConfigs.decryptAiApiKey(rowAi, env);
		expect(dec.apiKey).toBe("sk-x");

		// keep key without sending new
		await aiConfigs.upsertAiConfig(
			db,
			"u1",
			{ provider: "openai", model: "m2", apiKey: null },
			env,
		);

		await translate.resetStalePending(db, "u1", wl.id, Date.now() + 1);
		const cands = await translate.selectTranslateCandidates(db, "u1", wl.id, { limit: 5 });
		const firstCand = cands[0];
		if (firstCand) {
			await translate.markPending(
				db,
				"u1",
				cands.map((c) => c.id),
				Date.now(),
			);
			await translate.markTranslateResult(
				db,
				"u1",
				firstCand.id,
				{ ok: true, translatedText: "译", summaryText: "摘" },
				Date.now(),
			);
			await translate.markTranslateResult(
				db,
				"u1",
				firstCand.id,
				{ ok: false, error: "fail" },
				Date.now(),
			);
			await translate.loadSucceededTranslations(db, "u1", wl.id, [firstCand.id]);
		}
		const batch = await translate.runTranslateBatch(db, "u1", wl.id, {
			limit: 3,
			config: rowAi,
			apiKey: "sk-x",
			translateFn: async () => ({ translatedText: "译2", summaryText: null }),
		});
		expect(batch.results).toBeDefined();

		await integrationSecrets.upsertZhetoSettings(
			db,
			"u1",
			{ webhookUrl: "https://localhost/api/webhook/x", folder: "f" },
			env,
		);
		expect((await integrationSecrets.getZhetoSettings(db, "u1")).configured).toBe(true);
		const zCreds = await integrationSecrets.decryptZhetoWebhookUrl(db, "u1", env);
		expect(zCreds?.webhookUrl).toContain("localhost");
		expect((await integrationSecrets.getZhetoSettings(db, "u2")).configured).toBe(false);
		integrationSecrets.assertZhetoWebhookUrl("https://localhost/h", ["localhost"]);
		expect(() => integrationSecrets.assertZhetoWebhookUrl("http://x", ["localhost"])).toThrow();
		expect(() =>
			integrationSecrets.assertZhetoWebhookUrl("https://evil.com/h", ["localhost"]),
		).toThrow();
		integrationSecrets.assertZhetoWebhookUrl("https://zhe.to/api/webhook/abc");
		integrationSecrets.assertZhetoWebhookUrl(
			"https://zhe.to/api/link/create/d64e9289-ae8a-417f-9d0a-0daccdc1e3ee",
		);

		await pushTokens.revokePushToken(db, "u1", tok.id);
		expect(await pushTokens.findActiveTokenByHash(db, minted.tokenHash)).toBeNull();
		await members.deleteMember(db, "u1", wl.id, m.id);
		await items.deleteItem(db, "u1", itemId);
		expect(await items.deleteItem(db, "u1", 99999)).toBe(false);
		await groups.deleteGroup(db, "u1", g.id);
		await watchlists.deleteWatchlist(db, "u1", wl.id);
		expect(await watchlists.deleteWatchlist(db, "u1", wl.id)).toBe(false);

		const u = await users.upsertUserByAccess(db, {
			email: "new@t.local",
			name: "N",
			image: null,
			accessIss: "iss2",
			accessSub: "sub-new",
		});
		const u2 = await users.upsertUserByAccess(db, {
			email: "new@t.local",
			name: "N2",
			image: null,
			accessIss: "iss2",
			accessSub: "sub-new",
		});
		expect(u2.id).toBe(u.id);
	});
});
