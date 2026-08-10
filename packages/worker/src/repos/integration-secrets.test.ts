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
	return {
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
	} as unknown as D1Database;
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
});
