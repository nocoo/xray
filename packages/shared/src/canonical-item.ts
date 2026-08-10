import { isSourceType, type SourceType } from "./source.js";

const EXTERNAL_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const RFC3339_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MAX_TEXT = 20_000;
const MAX_TITLE = 500;
const MAX_META_BYTES = 8 * 1024;
const MAX_TAGS = 20;
const MAX_TAG_LEN = 64;

export type CanonicalAuthor = {
	id?: string;
	username?: string;
	display_name?: string;
	avatar_url?: string;
};

export type XTweetMetrics = {
	retweet_count?: number;
	reply_count?: number;
	like_count?: number;
	quote_count?: number;
	bookmark_count?: number;
	impression_count?: number;
};

export type XTweet = {
	id: string;
	text: string;
	author_id?: string;
	created_at?: string;
	conversation_id?: string;
	in_reply_to_user_id?: string;
	lang?: string;
	possibly_sensitive?: boolean;
	public_metrics?: XTweetMetrics;
	entities?: {
		urls?: Array<{
			start: number;
			end: number;
			url: string;
			expanded_url?: string;
			display_url?: string;
		}>;
		mentions?: Array<{ start: number; end: number; username: string; id?: string }>;
		hashtags?: Array<{ start: number; end: number; tag: string }>;
		cashtags?: Array<{ start: number; end: number; tag: string }>;
	};
	attachments?: { media_keys?: string[]; poll_ids?: string[] };
	referenced_tweets?: Array<{ type: "retweeted" | "quoted" | "replied_to"; id: string }>;
	note_tweet?: { text: string };
	edit_history_tweet_ids?: string[];
};

export type XUser = {
	id: string;
	name: string;
	username: string;
	profile_image_url?: string;
	description?: string;
	public_metrics?: {
		followers_count?: number;
		following_count?: number;
		tweet_count?: number;
		listed_count?: number;
	};
	verified?: boolean;
	protected?: boolean;
};

export type XMedia = {
	media_key: string;
	type: "photo" | "video" | "animated_gif";
	url?: string;
	preview_image_url?: string;
	width?: number;
	height?: number;
	duration_ms?: number;
};

export type CanonicalXItem = {
	source_type: "x.com";
	external_id: string;
	created_at: string;
	author?: CanonicalAuthor;
	meta?: Record<string, unknown>;
	body: {
		kind: "x.post";
		tweet: XTweet;
		includes?: {
			tweets?: XTweet[];
			users?: XUser[];
			media?: XMedia[];
		};
	};
};

export type CanonicalCustomItem = {
	source_type: "custom";
	external_id: string;
	created_at: string;
	author?: CanonicalAuthor;
	meta?: Record<string, unknown>;
	body: {
		kind: "custom";
		title?: string;
		text: string;
		url?: string;
		tags?: string[];
	};
};

export type CanonicalItem = CanonicalXItem | CanonicalCustomItem;

export type ParseFail = { ok: false; code: string; message: string };
export type ParseOk = { ok: true; value: CanonicalItem };

function isHttpsUrl(u: string): boolean {
	try {
		const x = new URL(u);
		return x.protocol === "https:";
	} catch {
		return false;
	}
}

function checkMeta(meta: unknown): ParseFail | null {
	if (meta === undefined) return null;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
		return { ok: false, code: "schema_mismatch", message: "meta must be object" };
	}
	const bytes = new TextEncoder().encode(JSON.stringify(meta)).byteLength;
	if (bytes > MAX_META_BYTES) {
		return { ok: false, code: "schema_mismatch", message: "meta exceeds 8 KiB" };
	}
	return null;
}

function parseAuthor(raw: unknown): CanonicalAuthor | undefined | ParseFail {
	if (raw === undefined) return undefined;
	if (!raw || typeof raw !== "object") {
		return { ok: false, code: "schema_mismatch", message: "author invalid" };
	}
	const a = raw as Record<string, unknown>;
	const out: CanonicalAuthor = {};
	if (a.id !== undefined) {
		if (typeof a.id !== "string" || !a.id.trim()) {
			return { ok: false, code: "schema_mismatch", message: "author.id invalid" };
		}
		out.id = a.id.trim();
	}
	if (a.username !== undefined) {
		if (typeof a.username !== "string") {
			return { ok: false, code: "schema_mismatch", message: "author.username invalid" };
		}
		out.username = a.username.trim();
	}
	if (a.display_name !== undefined) {
		if (typeof a.display_name !== "string") {
			return { ok: false, code: "schema_mismatch", message: "author.display_name invalid" };
		}
		out.display_name = a.display_name.trim();
	}
	if (a.avatar_url !== undefined) {
		if (typeof a.avatar_url !== "string" || !isHttpsUrl(a.avatar_url)) {
			return { ok: false, code: "schema_mismatch", message: "author.avatar_url must be https" };
		}
		out.avatar_url = a.avatar_url;
	}
	return out;
}

function optStr(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}
function optNum(v: unknown): number | undefined {
	return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function optBool(v: unknown): boolean | undefined {
	return typeof v === "boolean" ? v : undefined;
}

function parseXTweet(raw: unknown, required: boolean): XTweet | ParseFail | undefined {
	if (raw === undefined || raw === null) {
		return required
			? { ok: false, code: "schema_mismatch", message: "body.tweet required" }
			: undefined;
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, code: "schema_mismatch", message: "tweet invalid" };
	}
	const tw = raw as Record<string, unknown>;
	if (typeof tw.id !== "string" || !tw.id.trim()) {
		return { ok: false, code: "schema_mismatch", message: "tweet.id required" };
	}
	if (typeof tw.text !== "string" || !tw.text.trim() || tw.text.length > MAX_TEXT) {
		return { ok: false, code: "schema_mismatch", message: "tweet.text invalid" };
	}
	if (tw.created_at !== undefined) {
		if (typeof tw.created_at !== "string" || !RFC3339_Z.test(tw.created_at)) {
			return { ok: false, code: "schema_mismatch", message: "tweet.created_at invalid" };
		}
	}
	const out: XTweet = {
		id: tw.id.trim(),
		text: tw.text,
		author_id: optStr(tw.author_id),
		created_at: optStr(tw.created_at),
		conversation_id: optStr(tw.conversation_id),
		in_reply_to_user_id: optStr(tw.in_reply_to_user_id),
		lang: optStr(tw.lang),
		possibly_sensitive: optBool(tw.possibly_sensitive),
	};
	if (tw.public_metrics !== undefined) {
		if (
			!tw.public_metrics ||
			typeof tw.public_metrics !== "object" ||
			Array.isArray(tw.public_metrics)
		) {
			return { ok: false, code: "schema_mismatch", message: "tweet.public_metrics invalid" };
		}
		const m = tw.public_metrics as Record<string, unknown>;
		for (const [, v] of Object.entries(m)) {
			if (v !== undefined && typeof v !== "number") {
				return { ok: false, code: "schema_mismatch", message: "tweet.public_metrics invalid" };
			}
		}
		out.public_metrics = {
			retweet_count: optNum(m.retweet_count),
			reply_count: optNum(m.reply_count),
			like_count: optNum(m.like_count),
			quote_count: optNum(m.quote_count),
			bookmark_count: optNum(m.bookmark_count),
			impression_count: optNum(m.impression_count),
		};
	}
	if (tw.entities !== undefined) {
		if (!tw.entities || typeof tw.entities !== "object" || Array.isArray(tw.entities)) {
			return { ok: false, code: "schema_mismatch", message: "tweet.entities invalid" };
		}
		const ent = tw.entities as Record<string, unknown>;
		const entities: NonNullable<XTweet["entities"]> = {};
		for (const key of ["urls", "mentions", "hashtags", "cashtags"] as const) {
			if (ent[key] === undefined) continue;
			if (!Array.isArray(ent[key])) {
				return { ok: false, code: "schema_mismatch", message: `tweet.entities.${key} invalid` };
			}
			const arr = [];
			for (const item of ent[key] as unknown[]) {
				if (!item || typeof item !== "object") {
					return {
						ok: false,
						code: "schema_mismatch",
						message: `tweet.entities.${key} item invalid`,
					};
				}
				const it = item as Record<string, unknown>;
				if (typeof it.start !== "number" || typeof it.end !== "number") {
					return {
						ok: false,
						code: "schema_mismatch",
						message: `tweet.entities.${key} span invalid`,
					};
				}
				if (key === "urls") {
					if (typeof it.url !== "string") {
						return {
							ok: false,
							code: "schema_mismatch",
							message: "tweet.entities.urls.url invalid",
						};
					}
					arr.push({
						start: it.start,
						end: it.end,
						url: it.url,
						expanded_url: typeof it.expanded_url === "string" ? it.expanded_url : undefined,
						display_url: typeof it.display_url === "string" ? it.display_url : undefined,
					});
				} else if (key === "mentions") {
					if (typeof it.username !== "string") {
						return {
							ok: false,
							code: "schema_mismatch",
							message: "tweet.entities.mentions.username invalid",
						};
					}
					arr.push({
						start: it.start,
						end: it.end,
						username: it.username,
						id: typeof it.id === "string" ? it.id : undefined,
					});
				} else {
					if (typeof it.tag !== "string") {
						return {
							ok: false,
							code: "schema_mismatch",
							message: `tweet.entities.${key}.tag invalid`,
						};
					}
					arr.push({ start: it.start, end: it.end, tag: it.tag });
				}
			}
			(entities as Record<string, unknown>)[key] = arr;
		}
		out.entities = entities;
	}
	if (tw.attachments !== undefined) {
		if (!tw.attachments || typeof tw.attachments !== "object" || Array.isArray(tw.attachments)) {
			return { ok: false, code: "schema_mismatch", message: "tweet.attachments invalid" };
		}
		const a = tw.attachments as Record<string, unknown>;
		const attachments: NonNullable<XTweet["attachments"]> = {};
		if (a.media_keys !== undefined) {
			if (!Array.isArray(a.media_keys) || !a.media_keys.every((x) => typeof x === "string")) {
				return {
					ok: false,
					code: "schema_mismatch",
					message: "tweet.attachments.media_keys invalid",
				};
			}
			attachments.media_keys = a.media_keys as string[];
		}
		if (a.poll_ids !== undefined) {
			if (!Array.isArray(a.poll_ids) || !a.poll_ids.every((x) => typeof x === "string")) {
				return {
					ok: false,
					code: "schema_mismatch",
					message: "tweet.attachments.poll_ids invalid",
				};
			}
			attachments.poll_ids = a.poll_ids as string[];
		}
		out.attachments = attachments;
	}
	if (tw.public_metrics !== undefined) {
		if (
			!tw.public_metrics ||
			typeof tw.public_metrics !== "object" ||
			Array.isArray(tw.public_metrics)
		) {
			return { ok: false, code: "schema_mismatch", message: "tweet.public_metrics invalid" };
		}
		const m = tw.public_metrics as Record<string, unknown>;
		for (const k of Object.keys(m)) {
			if (m[k] !== undefined && typeof m[k] !== "number") {
				return { ok: false, code: "schema_mismatch", message: "tweet.public_metrics invalid" };
			}
		}
	}
	if (Array.isArray(tw.referenced_tweets)) {
		out.referenced_tweets = [];
		for (const r of tw.referenced_tweets) {
			if (!r || typeof r !== "object") continue;
			const rr = r as Record<string, unknown>;
			if (
				(rr.type === "retweeted" || rr.type === "quoted" || rr.type === "replied_to") &&
				typeof rr.id === "string"
			) {
				out.referenced_tweets.push({ type: rr.type, id: rr.id });
			}
		}
	}
	if (tw.note_tweet && typeof tw.note_tweet === "object" && !Array.isArray(tw.note_tweet)) {
		const n = tw.note_tweet as Record<string, unknown>;
		if (typeof n.text === "string" && n.text.trim()) out.note_tweet = { text: n.text };
	}
	if (Array.isArray(tw.edit_history_tweet_ids)) {
		out.edit_history_tweet_ids = tw.edit_history_tweet_ids.filter(
			(x): x is string => typeof x === "string",
		);
	}
	return out;
}

function parseXUser(raw: unknown): XUser | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const u = raw as Record<string, unknown>;
	if (typeof u.id !== "string" || typeof u.name !== "string" || typeof u.username !== "string")
		return null;
	const out: XUser = { id: u.id, name: u.name, username: u.username };
	if (typeof u.profile_image_url === "string" && isHttpsUrl(u.profile_image_url)) {
		out.profile_image_url = u.profile_image_url;
	}
	out.description = optStr(u.description);
	out.verified = optBool(u.verified);
	out.protected = optBool(u.protected);
	if (
		u.public_metrics &&
		typeof u.public_metrics === "object" &&
		!Array.isArray(u.public_metrics)
	) {
		const m = u.public_metrics as Record<string, unknown>;
		out.public_metrics = {
			followers_count: optNum(m.followers_count),
			following_count: optNum(m.following_count),
			tweet_count: optNum(m.tweet_count),
			listed_count: optNum(m.listed_count),
		};
	}
	return out;
}

function parseXMedia(raw: unknown): XMedia | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const m = raw as Record<string, unknown>;
	if (typeof m.media_key !== "string") return null;
	if (m.type !== "photo" && m.type !== "video" && m.type !== "animated_gif") return null;
	const out: XMedia = { media_key: m.media_key, type: m.type };
	if (typeof m.url === "string" && isHttpsUrl(m.url)) out.url = m.url;
	if (typeof m.preview_image_url === "string" && isHttpsUrl(m.preview_image_url)) {
		out.preview_image_url = m.preview_image_url;
	}
	out.width = optNum(m.width);
	out.height = optNum(m.height);
	out.duration_ms = optNum(m.duration_ms);
	return out;
}

/** Strict runtime parse of one canonical ingest item (docs/03). */
export function parseCanonicalItem(raw: unknown): ParseOk | ParseFail {
	if (!raw || typeof raw !== "object") {
		return { ok: false, code: "schema_mismatch", message: "item must be object" };
	}
	const item = raw as Record<string, unknown>;
	if (!isSourceType(item.source_type)) {
		return { ok: false, code: "schema_mismatch", message: "invalid source_type" };
	}
	if (typeof item.external_id !== "string" || !EXTERNAL_ID_RE.test(item.external_id)) {
		return { ok: false, code: "schema_mismatch", message: "invalid external_id" };
	}
	if (typeof item.created_at !== "string" || !RFC3339_Z.test(item.created_at)) {
		return {
			ok: false,
			code: "schema_mismatch",
			message: "created_at must be RFC3339 UTC Z",
		};
	}
	if (!Number.isFinite(Date.parse(item.created_at))) {
		return { ok: false, code: "schema_mismatch", message: "invalid created_at" };
	}
	const metaErr = checkMeta(item.meta);
	if (metaErr) return metaErr;
	const author = parseAuthor(item.author);
	if (author && "ok" in author && author.ok === false) return author;

	const body = item.body;
	if (!body || typeof body !== "object") {
		return { ok: false, code: "schema_mismatch", message: "body required" };
	}
	const b = body as Record<string, unknown>;

	if (item.source_type === "x.com") {
		if (b.kind !== "x.post") {
			return { ok: false, code: "schema_mismatch", message: "body.kind must be x.post" };
		}
		const tweet = parseXTweet(b.tweet, true);
		if (!tweet || ("ok" in tweet && tweet.ok === false)) {
			return tweet as ParseFail;
		}
		const out: CanonicalXItem = {
			source_type: "x.com",
			external_id: item.external_id,
			created_at: item.created_at,
			author: author as CanonicalAuthor | undefined,
			meta: item.meta as Record<string, unknown> | undefined,
			body: { kind: "x.post", tweet: tweet as XTweet },
		};
		if (b.includes && typeof b.includes === "object" && !Array.isArray(b.includes)) {
			const inc = b.includes as Record<string, unknown>;
			const includes: NonNullable<CanonicalXItem["body"]["includes"]> = {};
			if (inc.tweets !== undefined) {
				if (!Array.isArray(inc.tweets)) {
					return { ok: false, code: "schema_mismatch", message: "includes.tweets invalid" };
				}
				includes.tweets = [];
				for (const raw of inc.tweets) {
					const pt = parseXTweet(raw, true);
					if (!pt || ("ok" in pt && pt.ok === false)) {
						return pt as ParseFail;
					}
					includes.tweets.push(pt as XTweet);
				}
			}
			if (inc.users !== undefined) {
				if (!Array.isArray(inc.users)) {
					return { ok: false, code: "schema_mismatch", message: "includes.users invalid" };
				}
				includes.users = [];
				for (const raw of inc.users) {
					const u = parseXUser(raw);
					if (!u)
						return { ok: false, code: "schema_mismatch", message: "includes.users item invalid" };
					includes.users.push(u);
				}
			}
			if (inc.media !== undefined) {
				if (!Array.isArray(inc.media)) {
					return { ok: false, code: "schema_mismatch", message: "includes.media invalid" };
				}
				includes.media = [];
				for (const raw of inc.media) {
					const m = parseXMedia(raw);
					if (!m)
						return { ok: false, code: "schema_mismatch", message: "includes.media item invalid" };
					includes.media.push(m);
				}
			}
			if (includes.tweets || includes.users || includes.media) {
				out.body.includes = includes;
			}
		}
		return { ok: true, value: out };
	}

	// custom
	if (b.kind !== "custom") {
		return { ok: false, code: "schema_mismatch", message: "body.kind must be custom" };
	}
	if (typeof b.text !== "string" || !b.text.trim() || b.text.length > MAX_TEXT) {
		return { ok: false, code: "schema_mismatch", message: "custom text invalid" };
	}
	// reject raw HTML tags
	if (/<[a-zA-Z][\s\S]*>/.test(b.text)) {
		return { ok: false, code: "schema_mismatch", message: "custom text must not contain HTML" };
	}
	let title: string | undefined;
	if (b.title !== undefined) {
		if (typeof b.title !== "string" || b.title.length > MAX_TITLE) {
			return { ok: false, code: "schema_mismatch", message: "title invalid" };
		}
		title = b.title.trim() || undefined;
	}
	let url: string | undefined;
	if (b.url !== undefined && b.url !== null) {
		if (typeof b.url !== "string" || !isHttpsUrl(b.url)) {
			return { ok: false, code: "schema_mismatch", message: "url must be https" };
		}
		url = b.url;
	}
	let tags: string[] | undefined;
	if (b.tags !== undefined) {
		if (!Array.isArray(b.tags) || b.tags.length > MAX_TAGS) {
			return { ok: false, code: "schema_mismatch", message: "tags invalid" };
		}
		tags = [];
		for (const tag of b.tags) {
			if (typeof tag !== "string" || !tag.trim() || tag.length > MAX_TAG_LEN) {
				return { ok: false, code: "schema_mismatch", message: "tag invalid" };
			}
			tags.push(tag.trim());
		}
	}
	const out: CanonicalCustomItem = {
		source_type: "custom",
		external_id: item.external_id,
		created_at: item.created_at,
		author: author as CanonicalAuthor | undefined,
		meta: item.meta as Record<string, unknown> | undefined,
		body: { kind: "custom", text: b.text, title, url, tags },
	};
	return { ok: true, value: out };
}

export function canonicalText(item: CanonicalItem): string {
	return item.source_type === "x.com" ? item.body.tweet.text : item.body.text;
}

export function canonicalTitle(item: CanonicalItem): string | null {
	return item.source_type === "custom" ? (item.body.title ?? null) : null;
}

export function resolveAuthorId(item: CanonicalItem): string | null {
	if (item.source_type === "x.com") {
		return item.body.tweet.author_id ?? item.author?.id ?? null;
	}
	return item.author?.id ?? null;
}

export function resolveAuthorUsername(item: CanonicalItem): string | null {
	if (item.source_type === "x.com") {
		const aid = item.body.tweet.author_id;
		const users = item.body.includes?.users;
		if (aid && users) {
			const u = users.find((x) => x.id === aid);
			if (u?.username) return u.username;
		}
	}
	return item.author?.username ?? item.author?.display_name ?? null;
}

export type { SourceType };
