/** Channels: Markdown report contracts (docs/11-channels.md). */

export type Tag = { id: number; name: string };

export type Channel = {
	tags: Tag[];
	id: number;
	name: string;
	description: string | null;
	createdAtMs: number;
	articleCount: number;
	sortOrder: number;
	activeKeyCount: number;
	latestReportDate: string | null;
	lastReceivedAtMs: number | null;
};

export type ChannelKey = {
	tags: Tag[];
	id: number;
	channelId: number;
	label: string;
	tokenPrefix: string;
	createdAtMs: number;
	lastUsedAtMs: number | null;
};

export type ArticleInput = {
	external_id: string;
	title: string;
	report_date: string;
	markdown: string;
	summary?: string;
	author?: string;
};

export type ChannelArticleSummary = {
	tags: Tag[];
	id: number;
	channelId: number;
	externalId: string;
	title: string;
	reportDate: string;
	summary: string | null;
	author: string | null;
	sourceLabel: string;
	createdAtMs: number;
};

export type ChannelArticle = ChannelArticleSummary & { markdown: string };

export type ArticlePage = {
	items: ChannelArticleSummary[];
	nextCursor: number | null;
};

export const ARTICLE_LIMITS = {
	externalId: 160,
	title: 240,
	summary: 1000,
	author: 120,
	markdownBytes: 512 * 1024,
} as const;

export const ARTICLE_PAGE_DEFAULT_LIMIT = 30;
export const ARTICLE_PAGE_MAX_LIMIT = 100;

const ARTICLE_FIELDS = ["external_id", "title", "report_date", "markdown", "summary", "author"];

const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict YYYY-MM-DD with real calendar check (2026-02-30 invalid). */
export function isValidReportDate(value: string): boolean {
	if (!REPORT_DATE_RE.test(value)) return false;
	const y = Number(value.slice(0, 4));
	const m = Number(value.slice(5, 7));
	const d = Number(value.slice(8, 10));
	// setUTCFullYear avoids Date's two-digit-year 1900 offset for years 0-99
	const dt = new Date(0);
	dt.setUTCFullYear(y, m - 1, d);
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export type ParsedArticle = {
	externalId: string;
	title: string;
	reportDate: string;
	markdown: string;
	summary: string | null;
	author: string | null;
};

export type ArticleParseFail = { ok: false; status: 400 | 413; error: string };

function reqString(
	v: unknown,
	field: string,
	max: number,
): { ok: true; value: string } | ArticleParseFail {
	if (typeof v !== "string") return { ok: false, status: 400, error: `${field} required` };
	const t = v.trim();
	if (!t) return { ok: false, status: 400, error: `${field} required` };
	if (t.length > max) return { ok: false, status: 400, error: `${field} too long` };
	return { ok: true, value: t };
}

function optString(
	v: unknown,
	field: string,
	max: number,
): { ok: true; value: string | null } | ArticleParseFail {
	if (v === undefined || v === null) return { ok: true, value: null };
	if (typeof v !== "string") return { ok: false, status: 400, error: `${field} must be string` };
	const t = v.trim();
	if (t.length > max) return { ok: false, status: 400, error: `${field} too long` };
	return { ok: true, value: t || null };
}

const encoder = new TextEncoder();

/** Strict ArticleInput validation; markdown is stored verbatim (no trim). */
export function parseArticleInput(
	raw: unknown,
): { ok: true; value: ParsedArticle } | ArticleParseFail {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, status: 400, error: "body must be object" };
	}
	const o = raw as Record<string, unknown>;
	for (const key of Object.keys(o)) {
		if (!ARTICLE_FIELDS.includes(key)) {
			return { ok: false, status: 400, error: `unknown field: ${key}` };
		}
	}
	const externalId = reqString(o.external_id, "external_id", ARTICLE_LIMITS.externalId);
	if (!externalId.ok) return externalId;
	const title = reqString(o.title, "title", ARTICLE_LIMITS.title);
	if (!title.ok) return title;
	if (typeof o.report_date !== "string" || !isValidReportDate(o.report_date)) {
		return { ok: false, status: 400, error: "report_date must be a valid YYYY-MM-DD date" };
	}
	if (typeof o.markdown !== "string" || !o.markdown.trim()) {
		return { ok: false, status: 400, error: "markdown required" };
	}
	if (encoder.encode(o.markdown).length > ARTICLE_LIMITS.markdownBytes) {
		return { ok: false, status: 413, error: "markdown too large" };
	}
	const summary = optString(o.summary, "summary", ARTICLE_LIMITS.summary);
	if (!summary.ok) return summary;
	const author = optString(o.author, "author", ARTICLE_LIMITS.author);
	if (!author.ok) return author;
	return {
		ok: true,
		value: {
			externalId: externalId.value,
			title: title.value,
			reportDate: o.report_date,
			markdown: o.markdown,
			summary: summary.value,
			author: author.value,
		},
	};
}

export type ArticlePageQuery = {
	date: string | null;
	before: number | null;
	limit: number;
};

/** Query params for GET /api/channels/:id/articles. */
export function parseArticlePageQuery(raw: {
	date?: string | null;
	before?: string | null;
	limit?: string | null;
}): { ok: true; value: ArticlePageQuery } | { ok: false; error: string } {
	let date: string | null = null;
	if (raw.date != null && raw.date !== "") {
		if (!isValidReportDate(raw.date)) return { ok: false, error: "invalid date" };
		date = raw.date;
	}
	let before: number | null = null;
	if (raw.before != null && raw.before !== "") {
		const n = Number(raw.before);
		if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "invalid before" };
		before = n;
	}
	let limit = ARTICLE_PAGE_DEFAULT_LIMIT;
	if (raw.limit != null && raw.limit !== "") {
		const n = Number(raw.limit);
		if (!Number.isInteger(n) || n < 1 || n > ARTICLE_PAGE_MAX_LIMIT) {
			return { ok: false, error: `limit must be 1..${ARTICLE_PAGE_MAX_LIMIT}` };
		}
		limit = n;
	}
	return { ok: true, value: { date, before, limit } };
}
