/**
 * twitter-cli JSON → CanonicalItem (vendor-private mapper).
 * Prefer `createTwitterCliSource` at the orchestration boundary.
 * Do not import this from generic producer paths.
 */
import type { CanonicalItem, CanonicalXItem, XMedia, XTweet, XUser } from "./canonical-item.js";
import { parseCanonicalItem } from "./canonical-item.js";
import { normalizeHandle } from "./handle.js";

// Re-export generic batch helpers for older imports (prefer producer-core).
export {
	buildIngestBatches,
	filterItemsByWindow,
	INGEST_MAX_ITEMS,
	type IngestPushBody,
} from "./producer-core.js";

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
	return typeof v === "string" ? v : undefined;
}

/** IDs must be strings (or safe integer numbers) to avoid precision loss. */
function asIdStr(v: unknown): string | undefined {
	if (typeof v === "string") {
		const s = v.trim();
		return s || undefined;
	}
	if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) {
		return String(v);
	}
	return undefined;
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
	const id = asIdStr(t.id);
	const text = asStr(t.text);
	if (!id) return { ok: false, reason: "missing id" };
	if (!text?.trim()) return { ok: false, reason: "missing text" };

	const isoSrc = asStr(t.createdAtISO) || asStr(t.createdAt) || "";
	const createdAt = toRfc3339Z(isoSrc);
	if (!createdAt) return { ok: false, reason: "invalid created_at" };

	const author = t.author && typeof t.author === "object" ? t.author : undefined;
	const authorId = asIdStr(author?.id);
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
	// twitter-cli unwraps RT to the original tweet; original RT id is often absent.
	// Attribution lives in meta.retweeted_by (WL member handle), not referenced_tweets.
	const isRetweet = asBool(t.isRetweet) === true;
	const retweetedByRaw = asStr(t.retweetedBy)?.trim();
	const retweetedBy = retweetedByRaw ? normalizeHandle(retweetedByRaw) : undefined;

	const includesUsers: XUser[] = [];
	const includesTweets: XTweet[] = [];
	const userIds = new Set<string>();

	const pushUser = (u: XUser) => {
		if (userIds.has(u.id)) return;
		userIds.add(u.id);
		includesUsers.push(u);
	};

	const qt = t.quotedTweet;
	if (qt && typeof qt === "object") {
		const qid = asIdStr(qt.id);
		if (qid) {
			referenced.push({ type: "quoted", id: qid });
			// parseXTweet requires non-empty text — only embed when we have body.
			const qText = asStr(qt.text)?.trim();
			if (qText) {
				const qAuthorRaw = qt.author && typeof qt.author === "object" ? qt.author : undefined;
				const qScreen = asStr(qAuthorRaw?.screenName);
				const qUsername = qScreen ? normalizeHandle(qScreen) : undefined;
				const qDisplay = asStr(qAuthorRaw?.name)?.trim();
				const qAuthorId = asIdStr(qAuthorRaw?.id) || (qUsername ? `u:${qUsername}` : undefined);
				const qTweet: XTweet = { id: qid, text: qText };
				if (qAuthorId) qTweet.author_id = qAuthorId;
				includesTweets.push(qTweet);
				if (qAuthorId && qUsername) {
					const qu: XUser = {
						id: qAuthorId,
						name: qDisplay || qUsername,
						username: qUsername,
					};
					const qAvatar = httpsUrl(asStr(qAuthorRaw?.profileImageUrl));
					if (qAvatar) qu.profile_image_url = qAvatar;
					const qVerified = asBool(qAuthorRaw?.verified);
					if (qVerified !== undefined) qu.verified = qVerified;
					pushUser(qu);
				}
			}
		}
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

	if (authorId && username && displayName) {
		const user: XUser = {
			id: authorId,
			name: displayName,
			username,
		};
		const verified = asBool(author?.verified);
		if (verified !== undefined) user.verified = verified;
		if (avatar) user.profile_image_url = avatar;
		pushUser(user);
	}

	const includes: NonNullable<CanonicalXItem["body"]["includes"]> = {};
	if (includesUsers.length) includes.users = includesUsers;
	if (includesMedia.length) includes.media = includesMedia;
	if (includesTweets.length) includes.tweets = includesTweets;

	const meta: Record<string, unknown> = { producer: "twitter-cli" };
	if (isRetweet || retweetedBy) {
		meta.is_retweet = true;
		if (retweetedBy) meta.retweeted_by = retweetedBy;
	}

	const item: CanonicalXItem = {
		source_type: "x.com",
		external_id: id,
		created_at: createdAt,
		meta,
		body: {
			kind: "x.post",
			tweet,
			...(includes.users || includes.media || includes.tweets ? { includes } : {}),
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
