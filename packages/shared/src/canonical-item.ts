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

export type CanonicalXItem = {
	source_type: "x.com";
	external_id: string;
	created_at: string;
	author?: CanonicalAuthor;
	meta?: Record<string, unknown>;
	body: {
		kind: "x.post";
		tweet: {
			id: string;
			text: string;
			author_id?: string;
		};
		includes?: {
			users?: Array<{ id?: string; username?: string }>;
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
		const tweet = b.tweet;
		if (!tweet || typeof tweet !== "object") {
			return { ok: false, code: "schema_mismatch", message: "body.tweet required" };
		}
		const tw = tweet as Record<string, unknown>;
		if (typeof tw.id !== "string" || !tw.id.trim()) {
			return { ok: false, code: "schema_mismatch", message: "tweet.id required" };
		}
		if (typeof tw.text !== "string" || !tw.text.trim() || tw.text.length > MAX_TEXT) {
			return { ok: false, code: "schema_mismatch", message: "tweet.text invalid" };
		}
		const out: CanonicalXItem = {
			source_type: "x.com",
			external_id: item.external_id,
			created_at: item.created_at,
			author: author as CanonicalAuthor | undefined,
			meta: item.meta as Record<string, unknown> | undefined,
			body: {
				kind: "x.post",
				tweet: {
					id: tw.id.trim(),
					text: tw.text,
					author_id: typeof tw.author_id === "string" ? tw.author_id : undefined,
				},
			},
		};
		if (b.includes && typeof b.includes === "object") {
			const inc = b.includes as { users?: unknown };
			if (Array.isArray(inc.users)) {
				out.body.includes = {
					users: inc.users
						.filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
						.map((u) => ({
							id: typeof u.id === "string" ? u.id : undefined,
							username: typeof u.username === "string" ? u.username : undefined,
						})),
				};
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
