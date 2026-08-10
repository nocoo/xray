import { isSourceType, type SourceType } from "@xray/shared";
import type { Context } from "hono";
import { normalizeHandle } from "../lib/handle.js";
import { parseBearerToken, sha256Hex, timingSafeEqual } from "../lib/push-token-crypto.js";
import { checkIngestRateLimit } from "../lib/rate-limit.js";
import { insertItemIgnore } from "../repos/items.js";
import { findActiveTokenByHash, touchPushToken } from "../repos/push-tokens.js";
import { getWindowHours } from "../repos/settings.js";
import { getWatchlist } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

const MAX_BODY_BYTES = 1_048_576; // 1 MiB
const MAX_ITEMS = 50;
const EXTERNAL_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const FUTURE_SKEW_MS = 5 * 60_000;

type PushItem = {
	source_type?: unknown;
	external_id?: unknown;
	created_at?: unknown;
	author?: {
		username?: unknown;
		display_name?: unknown;
		id?: unknown;
	};
	body?: {
		kind?: unknown;
		title?: unknown;
		text?: unknown;
		url?: unknown;
		tweet?: { id?: unknown; text?: unknown };
		tags?: unknown;
	};
	meta?: unknown;
};

type ItemError = { index: number; code: string; message: string };

/**
 * POST /api/v1/ingest/push — ingest host + Bearer push token (docs/03).
 */
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

	// S45-05 scopes
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

	const rawText = await c.req.text();
	if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
		return c.json({ ok: false, error: "payload too large" }, 413);
	}

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

	// Window (S45-07)
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

	// Load members for match (S45-12)
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
		const item = body.items[i] as PushItem;
		const parsed = parseCanonicalItem(item);
		if (!parsed.ok) {
			rejected += 1;
			errors.push({ index: i, code: parsed.code, message: parsed.message });
			continue;
		}
		const createdAtMs = parsed.value.createdAtMs;
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

		const memberId = matchMember(memberRows ?? [], parsed.value);
		const result = await insertItemIgnore(c.env.DB, row.user_id, {
			watchlistId,
			sourceType: parsed.value.sourceType,
			externalId: parsed.value.externalId,
			memberId,
			authorUsername: parsed.value.authorUsername,
			title: parsed.value.title,
			text: parsed.value.text,
			createdAtMs,
			payload: sanitizePayload(item),
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

	// S45-09 wire contract
	return c.json({
		ok: true,
		accepted,
		deduped,
		rejected,
		errors,
	});
}

function matchMember(
	members: Array<{
		id: number;
		source_type: string;
		external_author_id: string | null;
		handle: string;
	}>,
	item: {
		sourceType: SourceType;
		authorId: string | null;
		authorUsername: string | null;
	},
): number | null {
	const same = members.filter((m) => m.source_type === item.sourceType);
	if (item.authorId) {
		const byId = same.find((m) => m.external_author_id === item.authorId);
		if (byId) return byId.id;
	}
	if (item.authorUsername) {
		const h = normalizeHandle(item.authorUsername);
		const byHandle = same.find((m) => m.handle === h);
		if (byHandle) return byHandle.id;
	}
	return null;
}

function sanitizePayload(item: PushItem): unknown {
	// Keep canonical fields only — drop unknown top-level junk that UI might spread
	return {
		source_type: item.source_type,
		external_id: item.external_id,
		created_at: item.created_at,
		author: item.author
			? {
					id: typeof item.author.id === "string" ? item.author.id : undefined,
					username: typeof item.author.username === "string" ? item.author.username : undefined,
					display_name:
						typeof item.author.display_name === "string" ? item.author.display_name : undefined,
				}
			: undefined,
		body: item.body,
		meta: item.meta && typeof item.meta === "object" ? item.meta : undefined,
	};
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
				authorId: string | null;
				createdAtMs: number;
			};
	  }
	| { ok: false; code: string; message: string } {
	if (!isSourceType(item.source_type)) {
		return { ok: false, code: "schema_mismatch", message: "invalid source_type" };
	}
	if (typeof item.external_id !== "string" || !EXTERNAL_ID_RE.test(item.external_id)) {
		return { ok: false, code: "schema_mismatch", message: "invalid external_id" };
	}
	if (typeof item.created_at !== "string") {
		return { ok: false, code: "schema_mismatch", message: "created_at required RFC3339 Z" };
	}
	// RFC3339 UTC with Z
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(item.created_at)) {
		return { ok: false, code: "schema_mismatch", message: "created_at must be RFC3339 UTC Z" };
	}
	const createdAtMs = Date.parse(item.created_at);
	if (!Number.isFinite(createdAtMs)) {
		return { ok: false, code: "schema_mismatch", message: "invalid created_at" };
	}

	const authorUsername =
		typeof item.author?.username === "string" ? item.author.username.trim() : null;
	const authorId = typeof item.author?.id === "string" ? item.author.id.trim() : null;

	if (item.source_type === "x.com") {
		if (item.body?.kind !== "x.post") {
			return { ok: false, code: "schema_mismatch", message: "body.kind must be x.post" };
		}
		const text =
			(typeof item.body.tweet?.text === "string" && item.body.tweet.text.trim()) ||
			(typeof item.body.text === "string" && item.body.text.trim()) ||
			"";
		if (!text || text.length > 20_000) {
			return { ok: false, code: "schema_mismatch", message: "invalid tweet text" };
		}
		return {
			ok: true,
			value: {
				sourceType: "x.com",
				externalId: item.external_id,
				text,
				title: null,
				authorUsername,
				authorId,
				createdAtMs,
			},
		};
	}

	if (item.body?.kind !== "custom") {
		return { ok: false, code: "schema_mismatch", message: "body.kind must be custom" };
	}
	const text = typeof item.body.text === "string" ? item.body.text.trim() : "";
	if (!text || text.length > 20_000) {
		return { ok: false, code: "schema_mismatch", message: "invalid custom text" };
	}
	const title =
		typeof item.body.title === "string" ? item.body.title.trim().slice(0, 500) || null : null;
	if (item.body.url !== undefined && item.body.url !== null) {
		if (typeof item.body.url !== "string" || !item.body.url.startsWith("https://")) {
			return { ok: false, code: "schema_mismatch", message: "url must be https" };
		}
	}
	return {
		ok: true,
		value: {
			sourceType: "custom",
			externalId: item.external_id,
			text,
			title,
			authorUsername:
				authorUsername ||
				(typeof item.author?.display_name === "string" ? item.author.display_name.trim() : null),
			authorId,
			createdAtMs,
		},
	};
}
