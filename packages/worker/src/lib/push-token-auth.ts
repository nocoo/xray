import type { Context } from "hono";
import { findActiveTokenByHash, touchPushToken } from "../repos/push-tokens.js";
import type { AppEnv, AuthUser } from "../types.js";
import { isDevOrTest } from "./env.js";
import { parseBearerToken, sha256Hex, timingSafeEqual } from "./push-token-crypto.js";
import { checkIngestRateLimit } from "./rate-limit.js";

export type PushTokenAuthOk = {
	ok: true;
	user: AuthUser;
	tokenId: number;
	scopes: string[];
};

export type PushTokenAuthErr = {
	ok: false;
	status: 401 | 403 | 429;
	error: string;
};

export async function authenticatePushToken(
	c: Context<AppEnv>,
	requiredScope: string,
): Promise<PushTokenAuthOk | PushTokenAuthErr> {
	const token = parseBearerToken(c.req.header("authorization"));
	if (!token) return { ok: false, status: 401, error: "Missing Bearer token" };

	const hash = await sha256Hex(token);
	const row = await findActiveTokenByHash(c.env.DB, hash);
	if (!row || !timingSafeEqual(row.token_hash, hash)) {
		return { ok: false, status: 401, error: "Invalid token" };
	}

	let scopes: string[] = [];
	try {
		const parsed = JSON.parse(row.scopes) as unknown;
		if (!Array.isArray(parsed)) {
			return { ok: false, status: 403, error: "Invalid token scopes" };
		}
		scopes = parsed.map(String);
	} catch {
		return { ok: false, status: 403, error: "Invalid token scopes" };
	}
	if (!scopes.includes(requiredScope)) {
		return { ok: false, status: 403, error: `Missing ${requiredScope} scope` };
	}

	if (isDevOrTest(c.env) && c.req.header("x-test-force-rl") === "1") {
		return { ok: false, status: 429, error: "Rate limited" };
	}

	const rl = await checkIngestRateLimit(c.env, `token:${row.id}`);
	if (!rl.allowed) {
		return { ok: false, status: 429, error: rl.reason || "Rate limited" };
	}

	const user: AuthUser = {
		id: row.user_id,
		email: "",
		name: null,
		image: null,
		accessIss: null,
		accessSub: null,
	};
	c.set("authUser", user);

	return { ok: true, user, tokenId: row.id, scopes };
}

export async function requirePushToken(
	c: Context<AppEnv>,
	requiredScope: string,
): Promise<PushTokenAuthOk | Response> {
	const auth = await authenticatePushToken(c, requiredScope);
	if (!auth.ok) return c.json({ ok: false, error: auth.error }, auth.status);
	return auth;
}

export { touchPushToken };
