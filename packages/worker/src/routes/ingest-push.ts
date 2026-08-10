import {
	type CanonicalItem,
	canonicalText,
	canonicalTitle,
	normalizeHandle,
	parseCanonicalItem,
	resolveAuthorId,
	resolveAuthorUsername,
	type SourceType,
} from "@xray/shared";
import type { Context } from "hono";
import { parseBearerToken, sha256Hex, timingSafeEqual } from "../lib/push-token-crypto.js";
import { checkIngestRateLimit } from "../lib/rate-limit.js";
import { insertItemIgnore } from "../repos/items.js";
import { findActiveTokenByHash, touchPushToken } from "../repos/push-tokens.js";
import { getWindowHours } from "../repos/settings.js";
import { getWatchlist } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

const MAX_BODY_BYTES = 1_048_576;
const MAX_ITEMS = 50;
const FUTURE_SKEW_MS = 5 * 60_000;

type ItemError = { index: number; code: string; message: string };

export async function ingestPushRoute(c: Context<AppEnv>) {
	const cl = c.req.header("content-length");
	if (cl && Number(cl) > MAX_BODY_BYTES) {
		return c.json({ ok: false, error: "payload too large" }, 413);
	}

	const token = parseBearerToken(c.req.header("authorization"));
	if (!token) return c.json({ ok: false, error: "Missing Bearer token" }, 401);

	const hash = await sha256Hex(token);
	const row = await findActiveTokenByHash(c.env.DB, hash);
	if (!row || !timingSafeEqual(row.token_hash, hash)) {
		return c.json({ ok: false, error: "Invalid token" }, 401);
	}

	let scopes: string[] = [];
	try {
		const parsed = JSON.parse(row.scopes) as unknown;
		if (!Array.isArray(parsed)) {
			return c.json({ ok: false, error: "Invalid token scopes" }, 403);
		}
		scopes = parsed.map(String);
	} catch {
		return c.json({ ok: false, error: "Invalid token scopes" }, 403);
	}
	if (!scopes.includes("ingest:push")) {
		return c.json({ ok: false, error: "Missing ingest:push scope" }, 403);
	}

	const rl = await checkIngestRateLimit(c.env, `token:${row.id}`);
	if (!rl.allowed) {
		return c.json({ ok: false, error: rl.reason || "Rate limited" }, 429);
	}

	const reader = c.req.raw.body?.getReader();
	if (!reader) return c.json({ ok: false, error: "empty body" }, 400);
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.byteLength;
			if (total > MAX_BODY_BYTES) {
				try {
					await reader.cancel();
				} catch {
					/* ignore */
				}
				return c.json({ ok: false, error: "payload too large" }, 413);
			}
			chunks.push(value);
		}
	}
	const merged = new Uint8Array(total);
	let off = 0;
	for (const ch of chunks) {
		merged.set(ch, off);
		off += ch.byteLength;
	}
	const rawText = new TextDecoder().decode(merged);

	let body: {
		watchlist_id?: unknown;
		items?: unknown;
		options?: { apply_window_hours?: unknown };
	};
	try {
		body = JSON.parse(rawText) as typeof body;
	} catch {
		return c.json({ ok: false, error: "invalid JSON" }, 400);
	}

	const watchlistId = Number(body.watchlist_id);
	if (!Number.isInteger(watchlistId) || watchlistId <= 0) {
		return c.json({ ok: false, error: "watchlist_id required" }, 400);
	}
	if (!Array.isArray(body.items)) {
		return c.json({ ok: false, error: "items required" }, 400);
	}
	if (body.items.length === 0) {
		return c.json({ ok: false, error: "items empty" }, 400);
	}
	if (body.items.length > MAX_ITEMS) {
		return c.json({ ok: false, error: `max ${MAX_ITEMS} items per request` }, 400);
	}

	const wl = await getWatchlist(c.env.DB, row.user_id, watchlistId);
	if (!wl) return c.json({ ok: false, error: "watchlist not found" }, 404);

	let windowHours: number;
	const optWin = body.options?.apply_window_hours;
	if (optWin !== undefined && optWin !== null) {
		const n = Number(optWin);
		if (!Number.isInteger(n) || n < 1 || n > 168) {
			return c.json({ ok: false, error: "apply_window_hours must be 1..168" }, 400);
		}
		windowHours = n;
	} else {
		windowHours = await getWindowHours(c.env.DB, row.user_id);
	}
	const windowMs = windowHours * 3600_000;
	const now = Date.now();

	const { results: memberRows } = await c.env.DB.prepare(
		`SELECT id, source_type, external_author_id, handle FROM watchlist_members
     WHERE user_id = ? AND watchlist_id = ?`,
	)
		.bind(row.user_id, watchlistId)
		.all<{
			id: number;
			source_type: string;
			external_author_id: string | null;
			handle: string;
		}>();

	let accepted = 0;
	let deduped = 0;
	let rejected = 0;
	const errors: ItemError[] = [];

	for (let i = 0; i < body.items.length; i++) {
		const parsed = parseCanonicalItem(body.items[i]);
		if (!parsed.ok) {
			rejected += 1;
			errors.push({ index: i, code: parsed.code, message: parsed.message });
			continue;
		}
		const item = parsed.value;
		const createdAtMs = Date.parse(item.created_at);
		if (createdAtMs > now + FUTURE_SKEW_MS) {
			rejected += 1;
			errors.push({ index: i, code: "outside_window", message: "created_at in the future" });
			continue;
		}
		if (now - createdAtMs > windowMs) {
			rejected += 1;
			errors.push({ index: i, code: "outside_window", message: "outside ingest window" });
			continue;
		}

		const authorId = resolveAuthorId(item);
		const authorUsername = resolveAuthorUsername(item);
		const memberId = matchMember(memberRows ?? [], item.source_type, authorId, authorUsername);
		const result = await insertItemIgnore(c.env.DB, row.user_id, {
			watchlistId,
			sourceType: item.source_type,
			externalId: item.external_id,
			memberId,
			authorUsername,
			title: canonicalTitle(item),
			text: canonicalText(item),
			createdAtMs,
			payload: item,
		});
		if (result === "accepted") accepted += 1;
		else deduped += 1;
	}

	await touchPushToken(c.env.DB, row.id);

	await c.env.DB.prepare(
		`INSERT INTO ingest_logs
     (user_id, watchlist_id, attempted, accepted, deduped, rejected, errors_json, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			row.user_id,
			watchlistId,
			body.items.length,
			accepted,
			deduped,
			rejected,
			errors.length ? JSON.stringify(errors) : null,
			Date.now(),
		)
		.run();

	return c.json({ ok: true, accepted, deduped, rejected, errors });
}

function matchMember(
	members: Array<{
		id: number;
		source_type: string;
		external_author_id: string | null;
		handle: string;
	}>,
	sourceType: SourceType,
	authorId: string | null,
	authorUsername: string | null,
): number | null {
	const same = members.filter((m) => m.source_type === sourceType);
	if (authorId) {
		const byId = same.find((m) => m.external_author_id === authorId);
		if (byId) return byId.id;
	}
	if (authorUsername) {
		const h = normalizeHandle(authorUsername);
		const byHandle = same.find((m) => m.handle === h);
		if (byHandle) return byHandle.id;
	}
	return null;
}

// keep type used for clarity
export type { CanonicalItem };
