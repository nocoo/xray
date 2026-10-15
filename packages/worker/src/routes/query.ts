import { parseContentQuery, parseQueryTokenAccess } from "@xray/shared";
import type { Context } from "hono";
import { jsonErr, jsonOk } from "../lib/http.js";
import { requirePushToken, touchPushToken } from "../lib/push-token-auth.js";
import { decodeQueryCursor } from "../lib/query-cursor.js";
import { queryContent } from "../repos/query.js";
import type { AppEnv } from "../types.js";

export async function queryRoute(c: Context<AppEnv>) {
	c.header("Cache-Control", "no-store");
	const auth = await requirePushToken(c, "query:read");
	if (auth instanceof Response) return auth;
	let raw: unknown;
	try {
		raw = JSON.parse(auth.queryAccessJson ?? "null");
	} catch {
		return jsonErr(c, "Invalid query access", 403);
	}
	const access = parseQueryTokenAccess(raw, true);
	if (!access.ok) return jsonErr(c, "Invalid query access", 403);
	const parsed = parseContentQuery(c.req.query());
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const context = {
		tokenId: auth.tokenId,
		accessJson: auth.queryAccessJson ?? "",
		query: parsed.value,
		key: auth.cursorKey,
	};
	const position = parsed.value.cursor
		? await decodeQueryCursor(parsed.value.cursor, context)
		: null;
	if (parsed.value.cursor && !position) return jsonErr(c, "invalid cursor", 400);
	const page = await queryContent(
		c.env.DB,
		auth.user.id,
		access.value,
		parsed.value,
		position,
		context,
	);
	await touchPushToken(c.env.DB, auth.tokenId);
	return jsonOk(c, page);
}
