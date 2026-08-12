import { describe, expect, test } from "vitest";
import {
	assertZhetoWebhookUrl,
	decryptZhetoWebhookUrl,
	getZhetoSettings,
	upsertZhetoSettings,
} from "./integration-secrets.js";

const KEK = "0123456789abcdef0123456789abcdef";

function memDb() {
	const rows: Array<Record<string, unknown>> = [];
	const api = {
		_rows: rows,
		prepare(_sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					return (rows.find((r) => r.user_id === binds[0] && r.integration === binds[1]) ??
						null) as T | null;
				},
				async run() {
					const [user_id, integration, ciphertext, key_version, meta_json, updated_at_ms] = binds;
					const idx = rows.findIndex((r) => r.user_id === user_id && r.integration === integration);
					const row = {
						user_id,
						integration,
						ciphertext,
						key_version,
						meta_json,
						updated_at_ms,
					};
					if (idx >= 0) rows[idx] = row;
					else rows.push(row);
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	};
	return api as unknown as D1Database & { _rows: Array<Record<string, unknown>> };
}

describe("integration-secrets zheto", () => {
	test("assert allowlist and encrypt round trip", async () => {
		expect(() => assertZhetoWebhookUrl("http://zhe.to/api/webhook/x")).toThrow(/https/);
		expect(() => assertZhetoWebhookUrl("https://evil.com/x", ["example.com"])).toThrow(/allowlist/);
		assertZhetoWebhookUrl("https://example.com/api/webhook/t", ["example.com"]);

		const db = memDb();
		const env = {
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
			ZHETO_WEBHOOK_ALLOW_HOSTS: "example.com",
		};
		const pub = await upsertZhetoSettings(
			db,
			"u1",
			{ webhookUrl: "https://example.com/api/webhook/tok", folder: "f" },
			env,
		);
		expect(pub.configured).toBe(true);
		const settings = await getZhetoSettings(db, "u1");
		expect(settings.folder).toBe("f");
		const dec = await decryptZhetoWebhookUrl(db, "u1", env);
		expect(dec?.webhookUrl).toBe("https://example.com/api/webhook/tok");
		expect(dec?.folder).toBe("f");
	});

	test("accepts link/create uuid and legacy webhook; folder optional", async () => {
		const link = "https://zhe.to/api/link/create/d64e9289-ae8a-417f-9d0a-0daccdc1e3ee";
		assertZhetoWebhookUrl(link);
		assertZhetoWebhookUrl(`${link}/`);
		assertZhetoWebhookUrl("https://zhe.to/api/webhook/legacy-token");
		expect(() => assertZhetoWebhookUrl("https://zhe.to/api/link/create/not-a-uuid")).toThrow(
			/link\/create/,
		);
		expect(() => assertZhetoWebhookUrl("https://zhe.to/api/other/x")).toThrow(/link\/create/);
		expect(() => assertZhetoWebhookUrl("https://zhe.to/api/webhook/../admin")).toThrow(
			/link\/create/,
		);
		expect(() => assertZhetoWebhookUrl("https://zhe.to/api/webhook/tok?x=1")).toThrow(
			/query or fragment/,
		);
		expect(() => assertZhetoWebhookUrl("https://zhe.to/api/webhook/tok#frag")).toThrow(
			/query or fragment/,
		);
		expect(() => assertZhetoWebhookUrl("https://user:pass@zhe.to/api/webhook/tok")).toThrow(
			/credentials/,
		);
		expect(() => assertZhetoWebhookUrl("not a url at all")).toThrow(/invalid/);

		const db = memDb();
		const env = { XRAY_SECRETS_KEK: KEK, XRAY_SECRETS_KEY_VERSION: "1" };
		const pub = await upsertZhetoSettings(db, "u2", { webhookUrl: link, folder: "" }, env);
		expect(pub.configured).toBe(true);
		expect(pub.folder).toBeNull();
		const dec = await decryptZhetoWebhookUrl(db, "u2", env);
		expect(dec?.webhookUrl).toBe(link);
		expect(dec?.folder).toBeNull();

		// keep webhook, update folder omitted → preserve; allowHosts subdomain
		assertZhetoWebhookUrl("https://hook.example.com/x", ["example.com"]);
		await upsertZhetoSettings(db, "u2", { folder: "keep-me" }, env);
		expect((await getZhetoSettings(db, "u2")).folder).toBe("keep-me");
		// folder undefined keeps previous
		await upsertZhetoSettings(db, "u2", {}, env);
		expect((await getZhetoSettings(db, "u2")).folder).toBe("keep-me");
		// explicit null clears folder
		await upsertZhetoSettings(db, "u2", { folder: null }, env);
		expect((await getZhetoSettings(db, "u2")).folder).toBeNull();
		// empty webhook path / non-zhe host without allowlist
		expect(() => assertZhetoWebhookUrl("https://zhe.to/api/webhook/")).toThrow(/link\/create/);
		expect(() =>
			assertZhetoWebhookUrl(
				"https://evil.com/api/link/create/d64e9289-ae8a-417f-9d0a-0daccdc1e3ee",
			),
		).toThrow(/link\/create/);
		// folder max trim
		await upsertZhetoSettings(db, "u2", { folder: ` ${"a".repeat(60)} ` }, env);
		expect((await getZhetoSettings(db, "u2")).folder?.length).toBe(50);

		// corrupt meta_json on existing row → folder stays null on read/update path
		const rawDb = db as unknown as { _rows: Array<Record<string, unknown>> };
		const row = rawDb._rows.find((r) => r.user_id === "u2");
		if (row) row.meta_json = "{not-json";
		expect((await getZhetoSettings(db, "u2")).folder).toBeNull();
		await upsertZhetoSettings(db, "u2", {}, env);
		expect((await getZhetoSettings(db, "u2")).folder).toBeNull();
		// non-string folder in meta
		if (row) row.meta_json = JSON.stringify({ folder: 99 });
		expect((await getZhetoSettings(db, "u2")).folder).toBeNull();
		// path with extra segment rejected
		expect(() =>
			assertZhetoWebhookUrl(
				"https://zhe.to/api/link/create/d64e9289-ae8a-417f-9d0a-0daccdc1e3ee/extra",
			),
		).toThrow(/link\/create/);

		// decrypt paths: string folder + corrupt meta
		await upsertZhetoSettings(db, "u3", { webhookUrl: link, folder: "inbox" }, env);
		const d1 = await decryptZhetoWebhookUrl(db, "u3", env);
		expect(d1?.folder).toBe("inbox");
		const row3 = rawDb._rows.find((r) => r.user_id === "u3");
		if (row3) row3.meta_json = "nope";
		const d2 = await decryptZhetoWebhookUrl(db, "u3", env);
		expect(d2?.folder).toBeNull();
		expect(await decryptZhetoWebhookUrl(db, "missing", env)).toBeNull();
		expect(await getZhetoSettings(db, "missing")).toMatchObject({ configured: false });
	});
});
