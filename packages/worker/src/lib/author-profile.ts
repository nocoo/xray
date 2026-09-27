import { type ExternalEnv, externalFetch } from "./external.js";
import { sha256Hex } from "./push-token-crypto.js";

export const AUTHOR_PROFILE_URL = "https://lizheng.blog/api/authors/profile";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type AuthorProfile = { name: string | null; avatar: string | null };

type ProfileCache = Map<string, { at: number; profile: AuthorProfile }>;
const cache: ProfileCache = new Map();
let bindingCaches = new WeakMap<Fetcher, ProfileCache>();

export function resetAuthorProfileCache(): void {
	cache.clear();
	bindingCaches = new WeakMap();
}

export function normalizeProfileEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function emailProfileHash(email: string): Promise<string> {
	return sha256Hex(normalizeProfileEmail(email));
}

export function parseAuthorProfile(raw: unknown): AuthorProfile {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { name: null, avatar: null };
	}
	const rec = raw as Record<string, unknown>;
	const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : null;
	const avatar =
		typeof rec.avatar === "string" && rec.avatar.startsWith("https://") ? rec.avatar : null;
	return { name, avatar };
}

export async function fetchAuthorProfile(
	email: string,
	env: ExternalEnv = {},
	nowMs: number = Date.now(),
): Promise<AuthorProfile> {
	let scope = cache;
	if (env.XRAY_EXTERNAL) {
		scope = bindingCaches.get(env.XRAY_EXTERNAL) ?? new Map();
		bindingCaches.set(env.XRAY_EXTERNAL, scope);
	}
	const hash = await emailProfileHash(email);
	const hit = scope.get(hash);
	if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.profile;

	const url = `${AUTHOR_PROFILE_URL}?hash=${hash}`;
	let status = 0;
	let json: unknown;
	try {
		const res = await externalFetch(env, url, {
			method: "GET",
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(4000),
		});
		status = res.status;
		if (status !== 200) return { name: null, avatar: null };
		json = await res.json();
	} catch {
		return { name: null, avatar: null };
	}
	const profile = parseAuthorProfile(json);
	scope.set(hash, { at: nowMs, profile });
	return profile;
}
