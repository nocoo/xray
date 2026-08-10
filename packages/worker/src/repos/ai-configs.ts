import {
	decryptSecret,
	encryptSecret,
	type KekMaterial,
	maskSecret,
	resolveKeks,
} from "../lib/secrets-crypto.js";

export type AiConfigRow = {
	user_id: string;
	provider: string;
	model: string | null;
	base_url: string | null;
	api_key_ciphertext: ArrayBuffer;
	api_key_key_version: number;
	translation_prompt: string | null;
	summary_prompt: string | null;
	updated_at_ms: number;
};

export type AiConfigPublic = {
	provider: string;
	model: string | null;
	baseUrl: string | null;
	apiKeyMasked: string;
	hasApiKey: boolean;
	apiKeyKeyVersion: number;
	translationPrompt: string | null;
	summaryPrompt: string | null;
	updatedAtMs: number;
};

function toPublic(row: AiConfigRow | null): AiConfigPublic | null {
	if (!row) return null;
	return {
		provider: row.provider,
		model: row.model,
		baseUrl: row.base_url,
		apiKeyMasked: maskSecret(true),
		hasApiKey: true,
		apiKeyKeyVersion: row.api_key_key_version,
		translationPrompt: row.translation_prompt,
		summaryPrompt: row.summary_prompt,
		updatedAtMs: row.updated_at_ms,
	};
}

export async function getAiConfig(db: D1Database, userId: string): Promise<AiConfigPublic | null> {
	const row = await db
		.prepare(`SELECT * FROM ai_configs WHERE user_id = ? LIMIT 1`)
		.bind(userId)
		.first<AiConfigRow>();
	return toPublic(row);
}

export async function getAiConfigRow(db: D1Database, userId: string): Promise<AiConfigRow | null> {
	return db
		.prepare(`SELECT * FROM ai_configs WHERE user_id = ? LIMIT 1`)
		.bind(userId)
		.first<AiConfigRow>();
}

export async function upsertAiConfig(
	db: D1Database,
	userId: string,
	input: {
		provider: string;
		model?: string | null;
		baseUrl?: string | null;
		apiKey?: string | null;
		translationPrompt?: string | null;
		summaryPrompt?: string | null;
	},
	env: {
		XRAY_SECRETS_KEK?: string;
		XRAY_SECRETS_KEK_PREV?: string;
		XRAY_SECRETS_KEY_VERSION?: string;
	},
): Promise<AiConfigPublic> {
	const provider = input.provider.trim();
	if (!provider) throw new AiConfigValidationError("provider required");
	const existing = await getAiConfigRow(db, userId);
	const now = Date.now();
	let ciphertext: Uint8Array;
	let keyVersion: number;
	if (input.apiKey?.trim()) {
		const keks = resolveKeks(env);
		const current = keks[0];
		if (!current) throw new Error("KEK missing");
		ciphertext = await encryptSecret(input.apiKey.trim(), current, `${userId}:ai.api_key`);
		keyVersion = current.version;
	} else if (existing) {
		ciphertext = new Uint8Array(existing.api_key_ciphertext);
		keyVersion = existing.api_key_key_version;
	} else {
		throw new AiConfigValidationError("apiKey required");
	}

	const model = input.model !== undefined ? input.model?.trim() || null : (existing?.model ?? null);
	const baseUrl =
		input.baseUrl !== undefined ? input.baseUrl?.trim() || null : (existing?.base_url ?? null);
	const translationPrompt =
		input.translationPrompt !== undefined
			? input.translationPrompt?.trim() || null
			: (existing?.translation_prompt ?? null);
	const summaryPrompt =
		input.summaryPrompt !== undefined
			? input.summaryPrompt?.trim() || null
			: (existing?.summary_prompt ?? null);

	await db
		.prepare(
			`INSERT INTO ai_configs
        (user_id, provider, model, base_url, api_key_ciphertext, api_key_key_version,
         translation_prompt, summary_prompt, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         provider=excluded.provider,
         model=excluded.model,
         base_url=excluded.base_url,
         api_key_ciphertext=excluded.api_key_ciphertext,
         api_key_key_version=excluded.api_key_key_version,
         translation_prompt=excluded.translation_prompt,
         summary_prompt=excluded.summary_prompt,
         updated_at_ms=excluded.updated_at_ms`,
		)
		.bind(
			userId,
			provider,
			model,
			baseUrl,
			ciphertext,
			keyVersion,
			translationPrompt,
			summaryPrompt,
			now,
		)
		.run();

	const row = await getAiConfigRow(db, userId);
	if (!row) throw new Error("failed to load ai config");
	const pub = toPublic(row);
	if (!pub) throw new Error("failed to map ai config");
	return pub;
}

export async function decryptAiApiKey(
	row: AiConfigRow,
	env: {
		XRAY_SECRETS_KEK?: string;
		XRAY_SECRETS_KEK_PREV?: string;
		XRAY_SECRETS_KEY_VERSION?: string;
	},
): Promise<{ apiKey: string; keks: KekMaterial[] }> {
	const keks = resolveKeks(env);
	const { plaintext } = await decryptSecret(
		row.api_key_ciphertext,
		keks,
		`${row.user_id}:ai.api_key`,
	);
	return { apiKey: plaintext, keks };
}

export class AiConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AiConfigValidationError";
	}
}
