import { sha256Hex } from "./push-token-crypto.js";

export const AUTHOR_PROFILE_URL = "https://lizheng.blog/api/authors/profile";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type AuthorProfile = { name: string | null; avatar: string | null };

export type AuthorProfileFetch = (
	url: string,
	init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

const cache = new Map<string, { at: number; profile: AuthorProfile }>();

export function resetAuthorProfileCache(): void {
	cache.clear();
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

export function shouldLookupAuthorProfile(env?: {
	ENVIRONMENT?: string;
	AUTHOR_PROFILE_FETCH?: AuthorProfileFetch;
}): boolean {
	if (!env) return false;
	if (env.AUTHOR_PROFILE_FETCH) return true;
	const mode = (env.ENVIRONMENT || "").toLowerCase();
	return mode === "production" || mode === "development";
}

export async function fetchAuthorProfile(
	email: string,
	fetchFn: AuthorProfileFetch,
	nowMs: number = Date.now(),
): Promise<AuthorProfile> {
	const hash = await emailProfileHash(email);
	const hit = cache.get(hash);
	if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.profile;

	const url = `${AUTHOR_PROFILE_URL}?hash=${hash}`;
	let status = 0;
	let json: unknown;
	try {
		const res = await fetchFn(url, {
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
	cache.set(hash, { at: nowMs, profile });
	return profile;
}
