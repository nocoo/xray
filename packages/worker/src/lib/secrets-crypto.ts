/** Versioned AES-256-GCM secret envelope (docs/02 §7, R2-07). */

const NONCE_LEN = 12;

export type KekMaterial = {
	/** Raw 32-byte key */
	bytes: Uint8Array;
	version: number;
};

export function parseKek(raw: string | undefined, version: number): KekMaterial {
	if (!raw) throw new Error("KEK missing");
	if (!Number.isInteger(version) || version < 1 || version > 255) {
		throw new Error("key version must be 1–255");
	}
	let bytes: Uint8Array;
	if (new TextEncoder().encode(raw).byteLength === 32 && raw.length === 32) {
		bytes = new TextEncoder().encode(raw);
	} else {
		try {
			const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
			const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
			const bin = atob(b64 + pad);
			bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		} catch {
			throw new Error("KEK must be exactly 32 bytes");
		}
	}
	if (bytes.byteLength !== 32) throw new Error("KEK must be exactly 32 bytes");
	return { bytes, version };
}

async function importKey(
	bytes: Uint8Array,
	usages: Array<"encrypt" | "decrypt">,
): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, usages);
}

/** AAD binds ciphertext to owner + purpose, e.g. `${userId}:ai.api_key`. */
export async function encryptSecret(
	plaintext: string,
	kek: KekMaterial,
	aad: string,
): Promise<Uint8Array> {
	const key = await importKey(kek.bytes, ["encrypt"]);
	const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
	const ct = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(aad) },
			key,
			new TextEncoder().encode(plaintext),
		),
	);
	const out = new Uint8Array(1 + NONCE_LEN + ct.byteLength);
	out[0] = kek.version & 0xff;
	out.set(nonce, 1);
	out.set(ct, 1 + NONCE_LEN);
	return out;
}

export async function decryptSecret(
	blob: ArrayBuffer | Uint8Array,
	keks: KekMaterial[],
	aad: string,
): Promise<{ plaintext: string; keyVersion: number; usedPrev: boolean }> {
	const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
	if (bytes.byteLength < 1 + NONCE_LEN + 16) throw new Error("ciphertext too short");
	const version = bytes[0] ?? 0;
	const nonce = bytes.slice(1, 1 + NONCE_LEN);
	const ct = bytes.slice(1 + NONCE_LEN);
	const aadBytes = new TextEncoder().encode(aad);
	let lastErr: unknown;
	for (let i = 0; i < keks.length; i++) {
		const kek = keks[i];
		if (!kek) continue;
		if (kek.version !== version && keks.length === 1) {
			// still try — version byte may lag during rotate
		}
		try {
			const key = await importKey(kek.bytes, ["decrypt"]);
			const pt = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: nonce, additionalData: aadBytes },
				key,
				ct,
			);
			return {
				plaintext: new TextDecoder().decode(pt),
				keyVersion: version,
				usedPrev: i > 0,
			};
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error("decrypt failed");
}

export function resolveKeks(env: {
	XRAY_SECRETS_KEK?: string;
	XRAY_SECRETS_KEK_PREV?: string;
	XRAY_SECRETS_KEY_VERSION?: string;
}): KekMaterial[] {
	const version = Number(env.XRAY_SECRETS_KEY_VERSION || "1");
	const current = parseKek(env.XRAY_SECRETS_KEK, version);
	const list: KekMaterial[] = [current];
	if (env.XRAY_SECRETS_KEK_PREV?.trim()) {
		list.push(parseKek(env.XRAY_SECRETS_KEK_PREV, Math.max(1, version - 1)));
	}
	return list;
}

export function maskSecret(has: boolean): string {
	return has ? "••••••••" : "";
}
