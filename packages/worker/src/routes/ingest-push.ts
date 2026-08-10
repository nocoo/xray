import { isSourceType, type SourceType } from "@xray/shared";
import type { Context } from "hono";
import { parseBearerToken, sha256Hex, timingSafeEqual } from "../lib/push-token-crypto.js";
import { checkIngestRateLimit } from "../lib/rate-limit.js";
import { insertItemIgnore } from "../repos/items.js";
import { findActiveTokenByHash, touchPushToken } from "../repos/push-tokens.js";
import { getWatchlist } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

type PushItem = {
	source_type?: string;
	external_id?: string;
	created_at?: string;
	author?: { username?: string; display_name?: string; id?: string };
	body?: {
		kind?: string;
		title?: string;
		text?: string;
		url?: string;
		tweet?: { id?: string; text?: string };
	};
	meta?: Record<string, unknown>;
};

/**
 * POST /api/v1/ingest/push — ingest host + Bearer push token.
 */
export async function ingestPushRoute(c: Context<AppEnv>) {
	const token = parseBearerToken(c.req.header("authorization"));
	if (!token) return c.json({ success: false, error: "Missing Bearer token" }, 401);

	const hash = await sha256Hex(token);
	const row = await findActiveTokenByHash(c.env.DB, hash);
	if (!row || !timingSafeEqual(row.token_hash, hash)) {
		return c.json({ success: false, error: "Invalid token" }, 401);
	}

	const rl = await checkIngestRateLimit(c.env, `token:${row.id}`);
	if (!rl.allowed) return c.json({ success: false, error: "Rate limited" }, 429);

	const body = (await c.req.json().catch(() => null)) as {
		watchlist_id?: number;
		items?: PushItem[];
	} | null;
	if (!body?.watchlist_id || !Array.isArray(body.items)) {
		return c.json({ success: false, error: "watchlist_id and items required" }, 400);
	}
	if (body.items.length === 0) {
		return c.json({ success: false, error: "items empty" }, 400);
	}
	if (body.items.length > 100) {
		return c.json({ success: false, error: "max 100 items per request" }, 400);
	}

	const wl = await getWatchlist(c.env.DB, row.user_id, body.watchlist_id);
	if (!wl) return c.json({ success: false, error: "watchlist not found" }, 404);

	let accepted = 0;
	let deduped = 0;
	const errors: Array<{ index: number; error: string }> = [];

	for (let i = 0; i < body.items.length; i++) {
		const item = body.items[i];
		if (!item) continue;
		const parsed = parseCanonicalItem(item);
		if (!parsed.ok) {
			errors.push({ index: i, error: parsed.error });
			continue;
		}
		const result = await insertItemIgnore(c.env.DB, row.user_id, {
			watchlistId: body.watchlist_id,
			sourceType: parsed.value.sourceType,
			externalId: parsed.value.externalId,
			authorUsername: parsed.value.authorUsername,
			title: parsed.value.title,
			text: parsed.value.text,
			createdAtMs: parsed.value.createdAtMs,
			payload: item,
		});
		if (result === "accepted") accepted += 1;
		else deduped += 1;
	}

	await touchPushToken(c.env.DB, row.id);

	const attempted = body.items.length;
	const rejected = errors.length;
	await c.env.DB.prepare(
		`INSERT INTO ingest_logs
     (user_id, watchlist_id, attempted, accepted, deduped, rejected, errors_json, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			row.user_id,
			body.watchlist_id,
			attempted,
			accepted,
			deduped,
			rejected,
			errors.length ? JSON.stringify(errors) : null,
			Date.now(),
		)
		.run();

	return c.json({
		success: true,
		data: { attempted, accepted, deduped, rejected, errors },
	});
}

function parseCanonicalItem(item: PushItem):
	| {
			ok: true;
			value: {
				sourceType: SourceType;
				externalId: string;
				text: string;
				title: string | null;
				authorUsername: string | null;
				createdAtMs: number;
			};
	  }
	| { ok: false; error: string } {
	if (!isSourceType(item.source_type)) {
		return { ok: false, error: "schema_mismatch: source_type" };
	}
	const externalId = (item.external_id ?? "").trim();
	if (!externalId || externalId.length > 128) {
		return { ok: false, error: "invalid external_id" };
	}
	const created = item.created_at ? Date.parse(item.created_at) : Date.now();
	if (!Number.isFinite(created)) return { ok: false, error: "invalid created_at" };

	if (item.source_type === "x.com") {
		if (item.body?.kind !== "x.post") {
			return { ok: false, error: "schema_mismatch: body.kind" };
		}
		const text = item.body.tweet?.text?.trim() || item.body.text?.trim() || "";
		if (!text) return { ok: false, error: "empty text" };
		return {
			ok: true,
			value: {
				sourceType: "x.com",
				externalId,
				text,
				title: null,
				authorUsername: item.author?.username?.trim() || null,
				createdAtMs: created,
			},
		};
	}

	if (item.body?.kind !== "custom") {
		return { ok: false, error: "schema_mismatch: body.kind" };
	}
	const text = item.body.text?.trim() || "";
	if (!text) return { ok: false, error: "empty text" };
	return {
		ok: true,
		value: {
			sourceType: "custom",
			externalId,
			text,
			title: item.body.title?.trim() || null,
			authorUsername: item.author?.username?.trim() || item.author?.display_name?.trim() || null,
			createdAtMs: created,
		},
	};
}
