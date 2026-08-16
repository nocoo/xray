import type { Context, Next } from "hono";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import {
	authDevBypassEnabled,
	DEV_BYPASS_IDENTITY,
	isDevOrTest,
	parseAllowedEmails,
} from "../lib/env.js";
import { classifyHost, isIngestAllowedPath } from "../lib/hosts.js";
import { UserBindConflictError, upsertUserByAccess } from "../repos/users.js";
import type { AppEnv, AuthUser } from "../types.js";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheTeamDomain: string | null = null;

/** Injectable for tests (S23-05). */
export type JwtVerifier = (token: string, teamDomain: string, aud: string) => Promise<JWTPayload>;

async function defaultJwtVerifier(
	token: string,
	teamDomain: string,
	aud: string,
): Promise<JWTPayload> {
	if (!(jwksCache && jwksCacheTeamDomain === teamDomain)) {
		jwksCache = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
		jwksCacheTeamDomain = teamDomain;
	}
	const { payload } = await jwtVerify(token, jwksCache, {
		issuer: `https://${teamDomain}`,
		audience: aud,
	});
	return payload;
}

let jwtVerifier: JwtVerifier = defaultJwtVerifier;

export function setJwtVerifierForTests(fn: JwtVerifier | null) {
	jwksCache = null;
	jwksCacheTeamDomain = null;
	jwtVerifier = fn ?? defaultJwtVerifier;
}

async function resolveIdentity(
	c: Context<AppEnv>,
): Promise<{ ok: true; user: AuthUser } | { ok: false; status: 401 | 403 | 500; error: string }> {
	const env = c.env;

	if (authDevBypassEnabled(env)) {
		if (!isDevOrTest(env)) {
			return {
				ok: false,
				status: 500,
				error: "AUTH_DEV_BYPASS forbidden outside development/test",
			};
		}
		// L2 dual-tenant: X-Test-Actor: a|b (test/development only)
		const actor = (c.req.header("x-test-actor") || "a").toLowerCase();
		const identity =
			actor === "b"
				? {
						email: "dev-b@xray.local",
						name: "Dev User B",
						image: null as string | null,
						accessIss: DEV_BYPASS_IDENTITY.accessIss,
						accessSub: "dev-bypass-sub-b",
					}
				: {
						email: DEV_BYPASS_IDENTITY.email,
						name: DEV_BYPASS_IDENTITY.name,
						image: DEV_BYPASS_IDENTITY.image,
						accessIss: DEV_BYPASS_IDENTITY.accessIss,
						accessSub: DEV_BYPASS_IDENTITY.accessSub,
					};
		try {
			const user = await upsertUserByAccess(env.DB, identity);
			return { ok: true, user };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return { ok: false, status: 500, error: msg };
		}
	}

	const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
	const aud = env.CF_ACCESS_AUD;
	if (!(teamDomain && aud)) {
		return {
			ok: false,
			status: 500,
			error: "Access authentication not configured. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.",
		};
	}

	const jwt = c.req.header("Cf-Access-Jwt-Assertion");
	if (!jwt) {
		return { ok: false, status: 401, error: "Missing Access JWT" };
	}

	let payload: JWTPayload;
	try {
		payload = await jwtVerifier(jwt, teamDomain, aud);
	} catch {
		return { ok: false, status: 403, error: "Invalid Access JWT" };
	}

	const email = typeof payload.email === "string" ? payload.email : "";
	const sub = typeof payload.sub === "string" ? payload.sub : "";
	const iss = typeof payload.iss === "string" ? payload.iss : `https://${teamDomain}`;
	if (!(email && sub)) {
		return { ok: false, status: 403, error: "Access JWT missing email or sub" };
	}

	// CF Access is the primary gate. ALLOWED_EMAILS is optional extra filter only when set.
	const allowed = parseAllowedEmails(env.ALLOWED_EMAILS);
	if (allowed.size > 0 && !allowed.has(email.toLowerCase())) {
		return { ok: false, status: 403, error: "Email not allowed" };
	}

	const name = typeof payload.name === "string" ? payload.name : (email.split("@")[0] ?? null);
	const image =
		typeof payload.picture === "string"
			? payload.picture
			: typeof payload.image === "string"
				? payload.image
				: null;

	try {
		const user = await upsertUserByAccess(env.DB, {
			email,
			name,
			image,
			accessIss: iss,
			accessSub: sub,
		});
		return { ok: true, user };
	} catch (e) {
		if (e instanceof UserBindConflictError) {
			console.error(
				JSON.stringify({
					level: "audit",
					event: "user_bind_conflict",
					email: email.toLowerCase(),
					message: e.message,
				}),
			);
			return { ok: false, status: 403, error: e.message };
		}
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, status: 500, error: msg };
	}
}

/**
 * Host + auth gate for /api/* (and used by entry for path decisions).
 * Live is public on allowed hosts only.
 */
export async function accessAuth(c: Context<AppEnv>, next: Next) {
	const path = c.req.path;
	const method = c.req.method;
	const host = c.req.header("host") || "";
	const kind = classifyHost(host);

	if (kind === "unknown") {
		return c.json({ error: "Unknown host" }, 404);
	}

	// Agent routes: ingest host or local wrangler (Host spoof / 127.0.0.1). Never browser.
	if (path === "/api/v1/ingest/push" || path === "/api/v1/ingest/graph") {
		if (kind !== "ingest" && kind !== "local") {
			return c.json({ error: "Not found" }, 404);
		}
		return next();
	}

	if (kind === "ingest") {
		if (!isIngestAllowedPath(method, path)) {
			return c.json({ error: "Not found" }, 404);
		}
		if (path === "/api/live") return next();
		return next();
	}

	// browser + local
	if (path === "/api/live") {
		return next();
	}

	const resolved = await resolveIdentity(c);
	if (!resolved.ok) {
		return c.json({ error: resolved.error }, resolved.status);
	}

	c.set("authUser", resolved.user);
	c.set("accessAuthenticated", true);
	return next();
}
