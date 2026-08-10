import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { mintPushToken } from "../lib/push-token-crypto.js";
import { createPushToken, listPushTokens, revokePushToken } from "../repos/push-tokens.js";
import type { AppEnv } from "../types.js";

export async function listTokensRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	return jsonOk(c, await listPushTokens(c.env.DB, user.id));
}

export async function createTokenRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const body = (await c.req.json().catch(() => null)) as { label?: string } | null;
	const label = body?.label?.trim() || "default";
	const minted = await mintPushToken();
	const meta = await createPushToken(
		c.env.DB,
		user.id,
		label,
		minted.tokenPrefix,
		minted.tokenHash,
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
