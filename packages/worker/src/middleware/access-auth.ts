import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
	authDevBypassEnabled,
	DEV_BYPASS_IDENTITY,
	isDevOrTest,
	parseAllowedEmails,
} from "../lib/env.js";
import { UserBindConflictError, upsertUserByAccess } from "../repos/users.js";
import type { AppEnv, AuthUser } from "../types.js";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheTeamDomain: string | null = null;

function getJWKS(teamDomain: string) {
	if (jwksCache && jwksCacheTeamDomain === teamDomain) return jwksCache;
	jwksCache = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	jwksCacheTeamDomain = teamDomain;
	return jwksCache;
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
	const parts = jwt.split(".");
	if (parts.length !== 3 || !parts[1]) return null;
	try {
		const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function hostKind(host: string): "browser" | "ingest" | "local" | "unknown" {
	const h = host.toLowerCase().split(":")[0] ?? "";
	if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) return "local";
	if (h.includes("ingest")) return "ingest";
	if (h.startsWith("xray.") || h.startsWith("xray-staging.") || h.startsWith("xray.dev.")) {
		return "browser";
	}
	return "unknown";
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
		try {
			const user = await upsertUserByAccess(env.DB, {
				email: DEV_BYPASS_IDENTITY.email,
				name: DEV_BYPASS_IDENTITY.name,
				image: DEV_BYPASS_IDENTITY.image,
				accessIss: DEV_BYPASS_IDENTITY.accessIss,
				accessSub: DEV_BYPASS_IDENTITY.accessSub,
			});
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

	try {
		const jwks = getJWKS(teamDomain);
		await jwtVerify(jwt, jwks, {
			issuer: `https://${teamDomain}`,
			audience: aud,
		});
	} catch {
		return { ok: false, status: 403, error: "Invalid Access JWT" };
	}

	const payload = decodeJwtPayload(jwt);
	const email = typeof payload?.email === "string" ? payload.email : "";
	const sub = typeof payload?.sub === "string" ? payload.sub : "";
	const iss =
		typeof payload?.iss === "string" ? payload.iss : `https://${teamDomain}`;
	if (!(email && sub)) {
		return { ok: false, status: 403, error: "Access JWT missing email or sub" };
	}

	const allowed = parseAllowedEmails(env.ALLOWED_EMAILS);
	if (allowed.size === 0) {
		return {
			ok: false,
			status: 500,
			error: "ALLOWED_EMAILS is mandatory",
		};
	}
	if (!allowed.has(email.toLowerCase())) {
		return { ok: false, status: 403, error: "Email not allowed" };
	}

	const name =
		typeof payload?.name === "string"
			? payload.name
			: (email.split("@")[0] ?? null);
	const image =
		typeof payload?.picture === "string"
			? payload.picture
			: typeof payload?.image === "string"
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
			return { ok: false, status: 403, error: e.message };
		}
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, status: 500, error: msg };
	}
}

export async function accessAuth(c: Context<AppEnv>, next: Next) {
	const path = c.req.path;
	if (path === "/api/live") {
		return next();
	}

	const host = c.req.header("host") || "";
	const kind = hostKind(host);

	// Ingest host: only live (already passed) and future push — other /api/* → 404
	if (kind === "ingest") {
		return c.json({ error: "Not found" }, 404);
	}

	if (kind === "unknown" && !authDevBypassEnabled(c.env) && !isDevOrTest(c.env)) {
		return c.json({ error: "Unknown host" }, 404);
	}

	const resolved = await resolveIdentity(c);
	if (!resolved.ok) {
		return c.json({ error: resolved.error }, resolved.status);
	}

	c.set("authUser", resolved.user);
	c.set("accessAuthenticated", true);
	return next();
}
