import { parseQueryTokenInput } from "@xray/shared";
import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { mintPushToken } from "../lib/push-token-crypto.js";
import { createQueryToken, revokeQueryToken, updateQueryToken } from "../repos/query-tokens.js";
import type { AppEnv } from "../types.js";

export async function createQueryTokenRoute(c: Context<AppEnv>) {
	c.header("Cache-Control", "no-store");
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const input = parseQueryTokenInput(await c.req.json().catch(() => null));
	if (!input.ok) return jsonErr(c, input.error, 400);
	const minted = await mintPushToken();
	const token = await createQueryToken(c.env.DB, user.id, input.value, minted);
	if (!token) return jsonErr(c, "Invalid or unowned sources", 400);
	return jsonOk(c, { ...token, token: minted.plaintext }, 201);
}

export async function patchQueryTokenRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const input = parseQueryTokenInput(await c.req.json().catch(() => null));
	if (!input.ok) return jsonErr(c, input.error, 400);
	if (!(await updateQueryToken(c.env.DB, user.id, id, input.value)))
		return jsonErr(c, "Token or selected sources not found", 404);
	return jsonOk(c, { updated: true });
}

export async function revokeQueryTokenRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	if (!(await revokeQueryToken(c.env.DB, user.id, id))) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { revoked: true });
}
