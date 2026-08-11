import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { listIngestLogsForWatchlist } from "../repos/ingest-logs.js";
import { getWatchlist } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

/** GET /api/watchlists/:id/ingest-logs?limit=20 */
export async function listWatchlistIngestLogsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const wl = await getWatchlist(c.env.DB, user.id, id);
	if (!wl) return jsonErr(c, "Not found", 404);
	const limRaw = c.req.query("limit");
	const limit = limRaw ? Number(limRaw) : 20;
	const data = await listIngestLogsForWatchlist(
		c.env.DB,
		user.id,
		id,
		Number.isFinite(limit) ? limit : 20,
	);
	return jsonOk(c, data);
}
