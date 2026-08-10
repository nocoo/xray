import { isSourceType } from "@xray/shared";
import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { deleteItem, listItems } from "../repos/items.js";
import { getWatchlist } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

export async function listItemsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const wl = await getWatchlist(c.env.DB, user.id, id);
	if (!wl) return jsonErr(c, "Not found", 404);
	const limit = Number(c.req.query("limit") ?? "50");
	const cursorRaw = c.req.query("cursor");
	const cursor = cursorRaw ? Number(cursorRaw) : null;
	const st = c.req.query("source_type");
	const sourceType = st && isSourceType(st) ? st : null;
	const data = await listItems(c.env.DB, user.id, id, {
		limit: Number.isFinite(limit) ? limit : 50,
		cursor: cursor && Number.isFinite(cursor) ? cursor : null,
		sourceType,
	});
	return jsonOk(c, data);
}

export async function deleteItemRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const itemId = parseIdParam(c.req.param("itemId"));
	if (!itemId) return jsonErr(c, "invalid item id", 400);
	const ok = await deleteItem(c.env.DB, user.id, itemId);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}
