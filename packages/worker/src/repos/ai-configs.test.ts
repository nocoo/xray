import { describe, expect, test } from "vitest";
import { decryptAiApiKey, getAiConfig, upsertAiConfig } from "./ai-configs.js";

const KEK = "0123456789abcdef0123456789abcdef";

function memDb() {
	const rows: Array<Record<string, unknown>> = [];
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("FROM ai_configs") || sql.includes("ai_configs")) {
						return (rows.find((r) => r.user_id === binds[0]) ?? null) as T | null;
					}
					return null;
				},
				async run() {
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
					const idx = rows.findIndex((r) => r.user_id === user_id);
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
					if (idx >= 0) rows[idx] = row;
					else rows.push(row);
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("ai-configs repo", () => {
	test("upsert encrypts and decrypt recovers; update keeps key", async () => {
		const db = memDb();
		const env = { XRAY_SECRETS_KEK: KEK, XRAY_SECRETS_KEY_VERSION: "1" };
		const pub = await upsertAiConfig(
			db,
			"u1",
			{ provider: "openai", apiKey: "sk-secret", model: "m" },
			env,
		);
		expect(pub.hasApiKey).toBe(true);
		expect(pub.apiKeyMasked.includes("•")).toBe(true);
		const got = await getAiConfig(db, "u1");
		expect(got?.provider).toBe("openai");

		const row = await db.prepare("SELECT * FROM ai_configs WHERE user_id = ?").bind("u1").first<{
			user_id: string;
			provider: string;
			model: string | null;
			base_url: string | null;
			api_key_ciphertext: Uint8Array;
			api_key_key_version: number;
			translation_prompt: string | null;
			summary_prompt: string | null;
			updated_at_ms: number;
		}>();
		if (!row) throw new Error("missing row");
		const { apiKey } = await decryptAiApiKey(row, env);
		expect(apiKey).toBe("sk-secret");

		await upsertAiConfig(db, "u1", { provider: "openai2" }, env);
		const row2 = await db
			.prepare("SELECT * FROM ai_configs WHERE user_id = ?")
			.bind("u1")
			.first<typeof row>();
		if (!row2) throw new Error("missing row2");
		expect(row2.provider).toBe("openai2");
		const d2 = await decryptAiApiKey(row2, env);
		expect(d2.apiKey).toBe("sk-secret");
	});
});
