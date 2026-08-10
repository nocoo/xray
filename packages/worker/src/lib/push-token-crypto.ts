/** Push token format: xray_pt_<8-char-prefix>_<32-byte-base64url-secret> */

const PREFIX = "xray_pt_";

function bytesToB64Url(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
	const out = new Uint8Array(n);
	crypto.getRandomValues(out);
	return out;
}

export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mintPushToken(): Promise<{
	plaintext: string;
	tokenPrefix: string;
	tokenHash: string;
}> {
	const prefixBytes = randomBytes(6);
	const tokenPrefix = bytesToB64Url(prefixBytes).slice(0, 8);
	const secret = bytesToB64Url(randomBytes(32));
	const plaintext = `${PREFIX}${tokenPrefix}_${secret}`;
	const tokenHash = await sha256Hex(plaintext);
	return { plaintext, tokenPrefix, tokenHash };
}

export function parseBearerToken(header: string | undefined): string | null {
	if (!header) return null;
	const m = header.match(/^Bearer\s+(.+)$/i);
	return m?.[1]?.trim() || null;
}

/** Constant-time string compare for equal-length hex hashes. */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let out = 0;
	for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return out === 0;
}
