import type { CanonicalItem, CanonicalXItem, XMedia, XTweet, XUser } from "./canonical-item.js";
import { parseCanonicalItem } from "./canonical-item.js";
import { normalizeHandle } from "./handle.js";

export const INGEST_MAX_ITEMS = 50;

export type TwitterCliAuthor = {
	id?: unknown;
	name?: unknown;
	screenName?: unknown;
	profileImageUrl?: unknown;
	verified?: unknown;
};

export type TwitterCliMetrics = {
	likes?: unknown;
	retweets?: unknown;
	replies?: unknown;
	quotes?: unknown;
	views?: unknown;
	bookmarks?: unknown;
};

export type TwitterCliMedia = {
	type?: unknown;
	url?: unknown;
	width?: unknown;
	height?: unknown;
};

export type TwitterCliTweet = {
	id?: unknown;
	text?: unknown;
	author?: TwitterCliAuthor | null;
	metrics?: TwitterCliMetrics | null;
	createdAt?: unknown;
	createdAtISO?: unknown;
	media?: TwitterCliMedia[] | null;
	urls?: unknown;
	isRetweet?: unknown;
	retweetedBy?: unknown;
	lang?: unknown;
	quotedTweet?: { id?: unknown; text?: unknown; author?: TwitterCliAuthor | null } | null;
	articleTitle?: unknown;
	articleText?: unknown;
};

export type TwitterCliEnvelope = {
	ok?: unknown;
	schema_version?: unknown;
	data?: unknown;
	error?: unknown;
	pagination?: unknown;
};

export type MapOk = { ok: true; value: CanonicalItem };
export type MapFail = { ok: false; reason: string };
export type MapResult = MapOk | MapFail;

function asStr(v: unknown): string | undefined {
	return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
}

function asNum(v: unknown): number | undefined {
	return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
	return typeof v === "boolean" ? v : undefined;
}

/** twitter-cli emits +00:00 ISO; ingest requires RFC3339 Z. */
export function toRfc3339Z(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	// Twitter classic: "Sat May 02 22:30:18 +0000 2026"
	const twitter = trimmed.match(
		/^[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{2}:\d{2}:\d{2} [+-]\d{4} \d{4}$/,
	);
	let ms: number;
	if (twitter) {
		ms = Date.parse(trimmed.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
	} else {
		ms = Date.parse(trimmed);
	}
	if (!Number.isFinite(ms)) return null;
	return new Date(ms).toISOString();
}

function httpsUrl(u: string | undefined): string | undefined {
	if (!u) return undefined;
	let s = u.trim();
	if (s.startsWith("http://")) s = `https://${s.slice("http://".length)}`;
	if (!s.startsWith("https://")) return undefined;
	try {
		const x = new URL(s);
		if (x.protocol !== "https:") return undefined;
		return s;
	} catch {
		return undefined;
	}
}

function mediaType(t: unknown): XMedia["type"] | null {
	if (t === "photo" || t === "video" || t === "animated_gif") return t;
	return null;
}

/**
 * Map one twitter-cli tweet object → canonical x.com item.
 * Does not throw; bad rows return { ok: false }.
 */
export function mapTwitterCliTweetToCanonical(raw: unknown): MapResult {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, reason: "tweet must be object" };
	}
	const t = raw as TwitterCliTweet;
	const id = asStr(t.id)?.trim();
	const text = asStr(t.text);
	if (!id) return { ok: false, reason: "missing id" };
	if (!text?.trim()) return { ok: false, reason: "missing text" };

	const isoSrc = asStr(t.createdAtISO) || asStr(t.createdAt) || "";
	const createdAt = toRfc3339Z(isoSrc);
	if (!createdAt) return { ok: false, reason: "invalid created_at" };

	const author = t.author && typeof t.author === "object" ? t.author : undefined;
	const authorId = asStr(author?.id)?.trim();
	const screen = asStr(author?.screenName);
	const username = screen ? normalizeHandle(screen) : undefined;
	const displayName = asStr(author?.name)?.trim();
	const avatar = httpsUrl(asStr(author?.profileImageUrl));

	const metrics = t.metrics && typeof t.metrics === "object" ? t.metrics : undefined;
	const public_metrics = metrics
		? {
				like_count: asNum(metrics.likes),
				retweet_count: asNum(metrics.retweets),
				reply_count: asNum(metrics.replies),
				quote_count: asNum(metrics.quotes),
				impression_count: asNum(metrics.views),
				bookmark_count: asNum(metrics.bookmarks),
			}
		: undefined;

	const tweet: XTweet = {
		id,
		text,
		created_at: createdAt,
	};
	if (authorId) tweet.author_id = authorId;
	const lang = asStr(t.lang)?.trim();
	if (lang) tweet.lang = lang;
	if (public_metrics) tweet.public_metrics = public_metrics;

	const referenced: NonNullable<XTweet["referenced_tweets"]> = [];
	if (asBool(t.isRetweet)) {
		// twitter-cli does not always expose original RT id; skip incomplete retweeted ref
	}
	const qt = t.quotedTweet;
	if (qt && typeof qt === "object") {
		const qid = asStr(qt.id)?.trim();
		if (qid) referenced.push({ type: "quoted", id: qid });
	}
	if (referenced.length) tweet.referenced_tweets = referenced;

	const includesMedia: XMedia[] = [];
	const mediaKeys: string[] = [];
	if (Array.isArray(t.media)) {
		let i = 0;
		for (const m of t.media) {
			if (!m || typeof m !== "object") continue;
			const type = mediaType(m.type);
			const url = httpsUrl(asStr(m.url));
			if (!type || !url) continue;
			const media_key = `m${i}`;
			i += 1;
			const xm: XMedia = { media_key, type, url };
			const w = asNum(m.width);
			const h = asNum(m.height);
			if (w !== undefined) xm.width = w;
			if (h !== undefined) xm.height = h;
			includesMedia.push(xm);
			mediaKeys.push(media_key);
		}
	}
	if (mediaKeys.length) tweet.attachments = { media_keys: mediaKeys };

	const includes: NonNullable<CanonicalXItem["body"]["includes"]> = {};
	if (authorId && username && displayName) {
		const user: XUser = {
			id: authorId,
			name: displayName,
			username,
		};
		const verified = asBool(author?.verified);
		if (verified !== undefined) user.verified = verified;
		if (avatar) user.profile_image_url = avatar;
		includes.users = [user];
	}
	if (includesMedia.length) includes.media = includesMedia;

	const item: CanonicalXItem = {
		source_type: "x.com",
		external_id: id,
		created_at: createdAt,
		meta: { producer: "twitter-cli" },
		body: {
			kind: "x.post",
			tweet,
			...(includes.users || includes.media ? { includes } : {}),
		},
	};

	if (authorId || username || displayName || avatar) {
		item.author = {};
		if (authorId) item.author.id = authorId;
		if (username) item.author.username = username;
		if (displayName) item.author.display_name = displayName;
		if (avatar) item.author.avatar_url = avatar;
	}

	const parsed = parseCanonicalItem(item);
	if (!parsed.ok) {
		return { ok: false, reason: `${parsed.code}: ${parsed.message}` };
	}
	return { ok: true, value: parsed.value };
}

export type EnvelopeMapResult = {
	items: CanonicalItem[];
	skipped: Array<{ index: number; reason: string }>;
	envelopeError?: string;
};

/** Map twitter-cli --json envelope (or bare tweet array) to canonical items. */
export function mapTwitterCliEnvelope(raw: unknown): EnvelopeMapResult {
	let tweets: unknown[] = [];
	if (Array.isArray(raw)) {
		tweets = raw;
	} else if (raw && typeof raw === "object") {
		const env = raw as TwitterCliEnvelope;
		if (env.ok === false) {
			const err =
				env.error && typeof env.error === "object"
					? JSON.stringify(env.error)
					: "envelope ok=false";
			return { items: [], skipped: [], envelopeError: err };
		}
		if (Array.isArray(env.data)) {
			tweets = env.data;
		} else {
			return { items: [], skipped: [], envelopeError: "envelope data is not an array" };
		}
	} else {
		return { items: [], skipped: [], envelopeError: "invalid envelope" };
	}

	const items: CanonicalItem[] = [];
	const skipped: Array<{ index: number; reason: string }> = [];
	tweets.forEach((tw, index) => {
		const r = mapTwitterCliTweetToCanonical(tw);
		if (r.ok) items.push(r.value);
		else skipped.push({ index, reason: r.reason });
	});
	return { items, skipped };
}

/** Keep items whose created_at is within the last `windowHours` (and not >5m future). */
export function filterItemsByWindow(
	items: CanonicalItem[],
	windowHours: number,
	nowMs: number = Date.now(),
): { kept: CanonicalItem[]; dropped: number } {
	const windowMs = windowHours * 3600_000;
	const futureSkew = 5 * 60_000;
	const kept: CanonicalItem[] = [];
	let dropped = 0;
	for (const it of items) {
		const ms = Date.parse(it.created_at);
		if (!Number.isFinite(ms) || ms > nowMs + futureSkew || nowMs - ms > windowMs) {
			dropped += 1;
			continue;
		}
		kept.push(it);
	}
	return { kept, dropped };
}

export type IngestPushBody = {
	watchlist_id: number;
	items: CanonicalItem[];
	options?: { apply_window_hours?: number };
};

/** Chunk items into ingest bodies of ≤ INGEST_MAX_ITEMS. */
export function buildIngestBatches(
	watchlistId: number,
	items: CanonicalItem[],
	options?: { apply_window_hours?: number },
): IngestPushBody[] {
	if (items.length === 0) return [];
	const batches: IngestPushBody[] = [];
	for (let i = 0; i < items.length; i += INGEST_MAX_ITEMS) {
		const chunk = items.slice(i, i + INGEST_MAX_ITEMS);
		const body: IngestPushBody = { watchlist_id: watchlistId, items: chunk };
		if (options?.apply_window_hours !== undefined) {
			body.options = { apply_window_hours: options.apply_window_hours };
		}
		batches.push(body);
	}
	return batches;
}
