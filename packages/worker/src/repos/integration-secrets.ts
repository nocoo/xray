import { decryptSecret, encryptSecret, resolveKeks } from "../lib/secrets-crypto.js";

export type IntegrationSecretRow = {
	user_id: string;
	integration: string;
	ciphertext: ArrayBuffer;
	key_version: number;
	meta_json: string | null;
	updated_at_ms: number;
};

const ZHETO = "zheto";
const ZHETO_URL_RE = /^https:\/\/zhe\.to\/api\/webhook\//i;

export type ZhetoSettingsPublic = {
	configured: boolean;
	webhookUrlMasked: string;
	folder: string | null;
	updatedAtMs: number | null;
};

export function assertZhetoWebhookUrl(url: string, allowHosts?: string[]): void {
	const u = url.trim();
	if (!u.startsWith("https://")) throw new IntegrationValidationError("webhookUrl must be https");
	if (allowHosts?.length) {
		try {
			const host = new URL(u).hostname.toLowerCase();
			if (!allowHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
				throw new IntegrationValidationError("webhookUrl host not allowlisted");
			}
		} catch (e) {
			if (e instanceof IntegrationValidationError) throw e;
			throw new IntegrationValidationError("webhookUrl invalid");
		}
		return;
	}
	if (!ZHETO_URL_RE.test(u)) {
		throw new IntegrationValidationError("webhookUrl must match https://zhe.to/api/webhook/…");
	}
}

export async function getZhetoSettings(
	db: D1Database,
	userId: string,
): Promise<ZhetoSettingsPublic> {
	const row = await db
		.prepare(`SELECT * FROM integration_secrets WHERE user_id = ? AND integration = ? LIMIT 1`)
		.bind(userId, ZHETO)
		.first<IntegrationSecretRow>();
	if (!row) {
		return { configured: false, webhookUrlMasked: "", folder: null, updatedAtMs: null };
	}
	let folder: string | null = null;
	if (row.meta_json) {
		try {
			const meta = JSON.parse(row.meta_json) as { folder?: string };
			folder = typeof meta.folder === "string" ? meta.folder : null;
		} catch {
			folder = null;
		}
	}
	return {
		configured: true,
		webhookUrlMasked: "••••••••",
		folder,
		updatedAtMs: row.updated_at_ms,
	};
}

export async function upsertZhetoSettings(
	db: D1Database,
	userId: string,
	input: { webhookUrl?: string; folder?: string | null },
	env: {
		XRAY_SECRETS_KEK?: string;
		XRAY_SECRETS_KEK_PREV?: string;
		XRAY_SECRETS_KEY_VERSION?: string;
		ZHETO_WEBHOOK_ALLOW_HOSTS?: string;
	},
): Promise<ZhetoSettingsPublic> {
	const existing = await db
		.prepare(`SELECT * FROM integration_secrets WHERE user_id = ? AND integration = ? LIMIT 1`)
		.bind(userId, ZHETO)
		.first<IntegrationSecretRow>();

	const allowHosts = env.ZHETO_WEBHOOK_ALLOW_HOSTS?.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	let ciphertext: Uint8Array;
	let keyVersion: number;
	if (input.webhookUrl?.trim()) {
		assertZhetoWebhookUrl(input.webhookUrl, allowHosts);
		const keks = resolveKeks(env);
		const current = keks[0];
		if (!current) throw new Error("KEK missing");
		ciphertext = await encryptSecret(
			input.webhookUrl.trim(),
			current,
			`${userId}:zheto.webhook_url`,
		);
		keyVersion = current.version;
	} else if (existing) {
		ciphertext = new Uint8Array(existing.ciphertext);
		keyVersion = existing.key_version;
	} else {
		throw new IntegrationValidationError("webhookUrl required");
	}

	let folder: string | null = null;
	if (input.folder !== undefined) {
		folder = input.folder?.trim().slice(0, 50) || null;
	} else if (existing?.meta_json) {
		try {
			const meta = JSON.parse(existing.meta_json) as { folder?: string };
			folder = typeof meta.folder === "string" ? meta.folder : null;
		} catch {
			folder = null;
		}
	}
	const metaJson = JSON.stringify({ folder });
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO integration_secrets
        (user_id, integration, ciphertext, key_version, meta_json, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, integration) DO UPDATE SET
         ciphertext=excluded.ciphertext,
         key_version=excluded.key_version,
         meta_json=excluded.meta_json,
         updated_at_ms=excluded.updated_at_ms`,
		)
		.bind(userId, ZHETO, ciphertext, keyVersion, metaJson, now)
		.run();
	return getZhetoSettings(db, userId);
}

export async function decryptZhetoWebhookUrl(
	db: D1Database,
	userId: string,
	env: {
		XRAY_SECRETS_KEK?: string;
		XRAY_SECRETS_KEK_PREV?: string;
		XRAY_SECRETS_KEY_VERSION?: string;
	},
): Promise<{ webhookUrl: string; folder: string | null } | null> {
	const row = await db
		.prepare(`SELECT * FROM integration_secrets WHERE user_id = ? AND integration = ? LIMIT 1`)
		.bind(userId, ZHETO)
		.first<IntegrationSecretRow>();
	if (!row) return null;
	const keks = resolveKeks(env);
	const { plaintext } = await decryptSecret(row.ciphertext, keks, `${userId}:zheto.webhook_url`);
	let folder: string | null = null;
	if (row.meta_json) {
		try {
			const meta = JSON.parse(row.meta_json) as { folder?: string };
			folder = typeof meta.folder === "string" ? meta.folder : null;
		} catch {
			folder = null;
		}
	}
	return { webhookUrl: plaintext, folder };
}

export class IntegrationValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IntegrationValidationError";
	}
}
