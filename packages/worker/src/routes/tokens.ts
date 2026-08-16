import type { Context } from "hono";
import { isDevOrTest } from "../lib/env.js";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { mintPushToken } from "../lib/push-token-crypto.js";
import {
	createPushToken,
	DEFAULT_INGEST_SCOPES,
	listPushTokens,
	revokePushToken,
} from "../repos/push-tokens.js";
import type { AppEnv } from "../types.js";

const INGEST_SCOPES = new Set(["ingest:read", "ingest:push"]);

function testOnlyScopes(env: AppEnv["Bindings"], raw: unknown): string[] | undefined {
	if (!isDevOrTest(env) || !Array.isArray(raw)) return undefined;
	const scopes = [...new Set(raw.map(String).filter((s) => INGEST_SCOPES.has(s)))];
	return scopes.length > 0 ? scopes : undefined;
}

export async function listTokensRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	return jsonOk(c, await listPushTokens(c.env.DB, user.id));
}

export async function createTokenRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const ct = c.req.header("content-type") || "";
	if (!ct.includes("application/json")) {
		return jsonErr(c, "Content-Type must be application/json", 400);
	}
	const body = (await c.req.json().catch(() => null)) as {
		label?: unknown;
		scopes?: unknown;
	} | null;
	if (!body || typeof body.label !== "string" || !body.label.trim()) {
		return jsonErr(c, "label required", 400);
	}
	const label = body.label.trim().slice(0, 64);
	const minted = await mintPushToken();
	const meta = await createPushToken(
		c.env.DB,
		user.id,
		label,
		minted.tokenPrefix,
		minted.tokenHash,
		testOnlyScopes(c.env, body.scopes) ?? [...DEFAULT_INGEST_SCOPES],
	);
	return jsonOk(
		c,
		{
			...meta,
			/** Full secret shown once */
			token: minted.plaintext,
		},
		201,
	);
}

export async function revokeTokenRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const ok = await revokePushToken(c.env.DB, user.id, id);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { revoked: true });
}
