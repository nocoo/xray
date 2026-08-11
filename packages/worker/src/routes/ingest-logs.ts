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
	if (limRaw != null && limRaw !== "") {
		if (!/^\d+$/.test(limRaw)) return jsonErr(c, "limit must be a positive integer", 400);
		const n = Number(limRaw);
		if (!Number.isSafeInteger(n) || n < 1 || n > 100) {
			return jsonErr(c, "limit must be 1–100", 400);
		}
		const data = await listIngestLogsForWatchlist(c.env.DB, user.id, id, n);
		return jsonOk(c, data);
	}
	const data = await listIngestLogsForWatchlist(c.env.DB, user.id, id, 20);
	return jsonOk(c, data);
}
