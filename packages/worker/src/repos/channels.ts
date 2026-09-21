import type {
	ArticlePage,
	ArticlePageQuery,
	Channel,
	ChannelArticle,
	ChannelArticleSummary,
	ParsedArticle,
} from "@xray/shared";

export type ChannelRow = {
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	created_at_ms: number;
	article_count?: number;
};

function toChannelDto(row: ChannelRow): Channel {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		createdAtMs: row.created_at_ms,
		articleCount: row.article_count ?? 0,
	};
}

export type ArticleRow = {
	id: number;
	user_id: string;
	channel_id: number;
	external_id: string;
	title: string;
	report_date: string;
	summary: string | null;
	author: string | null;
	markdown: string;
	source_key_id: number;
	source_label: string;
	created_at_ms: number;
};

function toSummaryDto(row: ArticleRow): ChannelArticleSummary {
	return {
		id: row.id,
		channelId: row.channel_id,
		externalId: row.external_id,
		title: row.title,
		reportDate: row.report_date,
		summary: row.summary,
		author: row.author,
		sourceLabel: row.source_label,
		createdAtMs: row.created_at_ms,
	};
}

function toArticleDto(row: ArticleRow): ChannelArticle {
	return { ...toSummaryDto(row), markdown: row.markdown };
}

export async function listChannels(db: D1Database, userId: string): Promise<Channel[]> {
	const { results } = await db
		.prepare(
			`SELECT c.*,
        (SELECT COUNT(*) FROM channel_articles a
         WHERE a.channel_id = c.id AND a.user_id = c.user_id) AS article_count
       FROM channels c WHERE c.user_id = ? ORDER BY c.id ASC`,
		)
		.bind(userId)
		.all<ChannelRow>();
	return (results ?? []).map(toChannelDto);
}

export async function getChannel(
	db: D1Database,
	userId: string,
	id: number,
): Promise<Channel | null> {
	const row = await db
		.prepare(
			`SELECT c.*,
        (SELECT COUNT(*) FROM channel_articles a
         WHERE a.channel_id = c.id AND a.user_id = c.user_id) AS article_count
       FROM channels c WHERE c.user_id = ? AND c.id = ? LIMIT 1`,
		)
		.bind(userId, id)
		.first<ChannelRow>();
	return row ? toChannelDto(row) : null;
}

export async function createChannel(
	db: D1Database,
	userId: string,
	input: { name: string; description?: string | null },
): Promise<Channel> {
	const now = Date.now();
	const result = await db
		.prepare(`INSERT INTO channels (user_id, name, description, created_at_ms) VALUES (?, ?, ?, ?)`)
		.bind(userId, input.name.trim(), input.description?.trim() || null, now)
		.run();
	const id = Number(result.meta.last_row_id);
	const channel = await getChannel(db, userId, id);
	if (!channel) throw new Error("failed to load channel");
	return channel;
}

export async function updateChannel(
	db: D1Database,
	userId: string,
	id: number,
	input: { name?: string; description?: string | null },
): Promise<Channel | null> {
	const existing = await getChannel(db, userId, id);
	if (!existing) return null;
	await db
		.prepare(`UPDATE channels SET name = ?, description = ? WHERE user_id = ? AND id = ?`)
		.bind(
			input.name !== undefined ? input.name.trim() : existing.name,
			input.description !== undefined ? input.description?.trim() || null : existing.description,
			userId,
			id,
		)
		.run();
	return getChannel(db, userId, id);
}

const ARTICLE_COLS = `id, channel_id, external_id, title, report_date, summary, author, source_label, created_at_ms`;

/**
 * Date-aware cursor pagination. Sort: report_date DESC, id DESC.
 * Returns null when the `before` cursor is unknown/stale.
 */
export async function listChannelArticles(
	db: D1Database,
	userId: string,
	channelId: number,
	query: ArticlePageQuery,
): Promise<ArticlePage | null> {
	let cursor: { reportDate: string; id: number } | null = null;
	if (query.before != null) {
		const row = await db
			.prepare(
				`SELECT report_date FROM channel_articles
				 WHERE id = ? AND channel_id = ? AND user_id = ? LIMIT 1`,
			)
			.bind(query.before, channelId, userId)
			.first<{ report_date: string }>();
		if (!row) return null;
		cursor = { reportDate: row.report_date, id: query.before };
	}

	const conds = ["user_id = ?", "channel_id = ?"];
	const binds: unknown[] = [userId, channelId];
	if (query.date) {
		conds.push("report_date = ?");
		binds.push(query.date);
	}
	if (cursor) {
		conds.push("(report_date < ? OR (report_date = ? AND id < ?))");
		binds.push(cursor.reportDate, cursor.reportDate, cursor.id);
	}
	const { results } = await db
		.prepare(
			`SELECT ${ARTICLE_COLS} FROM channel_articles
			 WHERE ${conds.join(" AND ")}
			 ORDER BY report_date DESC, id DESC
			 LIMIT ?`,
		)
		.bind(...binds, query.limit + 1)
		.all<ArticleRow>();
	const rows = results ?? [];
	const hasMore = rows.length > query.limit;
	const page = hasMore ? rows.slice(0, query.limit) : rows;
	return {
		items: page.map(toSummaryDto),
		nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
	};
}

export async function getChannelArticle(
	db: D1Database,
	userId: string,
	channelId: number,
	articleId: number,
): Promise<ChannelArticle | null> {
	const row = await db
		.prepare(
			`SELECT * FROM channel_articles
			 WHERE id = ? AND channel_id = ? AND user_id = ? LIMIT 1`,
		)
		.bind(articleId, channelId, userId)
		.first<ArticleRow>();
	return row ? toArticleDto(row) : null;
}

export type IngestArticleResult =
	| { status: "created"; article: ChannelArticle }
	| { status: "duplicate"; article: ChannelArticle }
	| { status: "conflict" };

/**
 * Immutable insert with idempotency on (channel_id, external_id).
 * - Same key + identical content → duplicate (original kept)
 * - Different key (source ownership) or different content → conflict
 */
export async function ingestChannelArticle(
	db: D1Database,
	userId: string,
	channelId: number,
	source: { keyId: number; label: string },
	input: ParsedArticle,
): Promise<IngestArticleResult> {
	const now = Date.now();
	const result = await db
		.prepare(
			`INSERT INTO channel_articles
			 (user_id, channel_id, external_id, title, report_date, summary, author, markdown,
			  source_key_id, source_label, created_at_ms)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (channel_id, external_id) DO NOTHING`,
		)
		.bind(
			userId,
			channelId,
			input.externalId,
			input.title,
			input.reportDate,
			input.summary,
			input.author,
			input.markdown,
			source.keyId,
			source.label,
			now,
		)
		.run();

	if ((result.meta.changes ?? 0) > 0) {
		const article = await getChannelArticle(db, userId, channelId, Number(result.meta.last_row_id));
		if (!article) throw new Error("failed to load article");
		return { status: "created", article };
	}

	const existing = await db
		.prepare(
			`SELECT * FROM channel_articles
			 WHERE channel_id = ? AND external_id = ? AND user_id = ? LIMIT 1`,
		)
		.bind(channelId, input.externalId, userId)
		.first<ArticleRow>();
	if (!existing) throw new Error("ingest conflict but no existing row");
	if (existing.source_key_id !== source.keyId) return { status: "conflict" };
	if (
		existing.title !== input.title ||
		existing.report_date !== input.reportDate ||
		existing.markdown !== input.markdown ||
		(existing.summary ?? null) !== input.summary ||
		(existing.author ?? null) !== input.author
	) {
		return { status: "conflict" };
	}
	return { status: "duplicate", article: toArticleDto(existing) };
}
