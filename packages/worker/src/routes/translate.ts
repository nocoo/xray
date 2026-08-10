import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { decryptAiApiKey, getAiConfigRow } from "../repos/ai-configs.js";
import { runTranslateBatch, TRANSLATE_MAX } from "../repos/translate.js";
import { getWatchlist } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

export async function translateWatchlistRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const wl = await getWatchlist(c.env.DB, user.id, id);
	if (!wl) return jsonErr(c, "Not found", 404);

	const raw = await c.req.json().catch(() => ({}));
	const body =
		raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	let limit = TRANSLATE_MAX;
	if (body.limit !== undefined) {
		if (typeof body.limit !== "number" || !Number.isInteger(body.limit) || body.limit < 1) {
			return jsonErr(c, "limit invalid", 400);
		}
		limit = Math.min(TRANSLATE_MAX, body.limit);
	}
	let itemIds: number[] | undefined;
	if (body.item_ids !== undefined) {
		if (
			!Array.isArray(body.item_ids) ||
			!body.item_ids.every((n) => typeof n === "number" && Number.isInteger(n))
		) {
			return jsonErr(c, "item_ids invalid", 400);
		}
		itemIds = body.item_ids as number[];
	}

	const config = await getAiConfigRow(c.env.DB, user.id);
	if (!config) return jsonErr(c, "AI config not set", 400);

	let apiKey: string;
	try {
		({ apiKey } = await decryptAiApiKey(config, c.env));
	} catch {
		return jsonErr(c, "AI key decrypt failed", 500);
	}

	const translateFn = c.env.TRANSLATE_FN;
	const result = await runTranslateBatch(c.env.DB, user.id, id, {
		limit,
		itemIds,
		config,
		apiKey,
		translateFn,
	});
	return jsonOk(c, result);
}
