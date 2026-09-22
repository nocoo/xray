import type {
	ArticlePage,
	ArticlePageQuery,
	Channel,
	ChannelArticle,
	ChannelArticleSummary,
	ParsedArticle,
} from "@xray/shared";

export type ChannelRow = {
	tags_json?: string;
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	created_at_ms: number;
	article_count?: number;
	sort_order: number;
	active_key_count: number;
	latest_report_date: string | null;
	last_received_at_ms: number | null;
};

function toChannelDto(row: ChannelRow): Channel {
	return {
		id: row.id,
		tags: JSON.parse(row.tags_json ?? "[]"),
		name: row.name,
		description: row.description,
		createdAtMs: row.created_at_ms,
		articleCount: row.article_count ?? 0,
		sortOrder: row.sort_order,
		activeKeyCount: row.active_key_count,
		latestReportDate: row.latest_report_date,
		lastReceivedAtMs: row.last_received_at_ms,
	};
}

export type ArticleRow = {
	tags_json: string;
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
		tags: JSON.parse(row.tags_json),
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

const CHANNEL_SELECT = `SELECT c.*,
 (SELECT json_group_array(json_object('id', t.id, 'name', t.name)) FROM channel_tags ct
 JOIN tags t ON t.id = ct.tag_id WHERE ct.channel_id = c.id AND t.user_id = c.user_id) AS tags_json,
  (SELECT COUNT(*) FROM channel_articles a
   WHERE a.channel_id = c.id AND a.user_id = c.user_id) AS article_count,
  (SELECT COUNT(*) FROM push_tokens k
   WHERE k.channel_id = c.id AND k.user_id = c.user_id AND k.revoked_at_ms IS NULL) AS active_key_count,
  (SELECT MAX(a.report_date) FROM channel_articles a
   WHERE a.channel_id = c.id AND a.user_id = c.user_id) AS latest_report_date,
  (SELECT MAX(a.created_at_ms) FROM channel_articles a
   WHERE a.channel_id = c.id AND a.user_id = c.user_id) AS last_received_at_ms
  FROM channels c WHERE c.user_id = ?`;

export async function listChannels(db: D1Database, userId: string): Promise<Channel[]> {
	const { results } = await db
		.prepare(`${CHANNEL_SELECT} ORDER BY c.sort_order, c.id`)
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
		.prepare(`${CHANNEL_SELECT} AND c.id = ? LIMIT 1`)
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
		.prepare(`INSERT INTO channels (user_id, name, description, created_at_ms, sort_order)
 SELECT ?, ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1 FROM channels WHERE user_id = ?`)
		.bind(userId, input.name.trim(), input.description?.trim() || null, now, userId)
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

export async function deleteChannel(db: D1Database, userId: string, id: number): Promise<boolean> {
	const result = await db
		.prepare("DELETE FROM channels WHERE user_id = ? AND id = ?")
		.bind(userId, id)
		.run();
	return result.meta.changes > 0;
}

export async function orderChannels(
	db: D1Database,
	userId: string,
	ids: number[],
): Promise<Channel[] | null> {
	const [updated, listed] = await db.batch<ChannelRow>([
		db
			.prepare(`
 WITH requested AS MATERIALIZED (SELECT key AS position, value AS id FROM json_each(?))
 UPDATE channels SET sort_order = (SELECT position FROM requested WHERE requested.id = channels.id)
 WHERE user_id = ?
 AND (SELECT COUNT(*) FROM channels WHERE user_id = ?) = (SELECT COUNT(*) FROM requested)
 AND (SELECT COUNT(DISTINCT c.id) FROM channels c JOIN requested r ON r.id = c.id WHERE c.user_id = ?) = (SELECT COUNT(*) FROM requested)
 `)
			.bind(JSON.stringify(ids), userId, userId, userId),
		db.prepare(`${CHANNEL_SELECT} ORDER BY c.sort_order, c.id`).bind(userId),
	]);
	if (!updated || !listed) throw new Error("incomplete channel order batch");
	if (updated.meta.changes !== ids.length || listed.results.length !== ids.length) return null;
	return listed.results.map(toChannelDto);
}

const ARTICLE_COLS = `id, channel_id, external_id, title, report_date, summary, author, source_label, created_at_ms`;

const ARTICLE_TAG_UNION = `
  SELECT t.id, t.name FROM channel_tags ct
  JOIN channels c ON c.id = ct.channel_id
  JOIN tags t ON t.id = ct.tag_id AND t.user_id = c.user_id
  WHERE c.id = a.channel_id AND c.user_id = a.user_id
  UNION
  SELECT t.id, t.name FROM channel_key_tags kt
  JOIN push_tokens k ON k.id = kt.key_id
  JOIN channels c ON c.id = k.channel_id AND c.user_id = k.user_id
  JOIN tags t ON t.id = kt.tag_id AND t.user_id = k.user_id
  WHERE k.id = a.source_key_id AND k.channel_id = a.channel_id AND k.user_id = a.user_id
`;
const ARTICLE_TAGS = `(SELECT json_group_array(json_object('id', t.id, 'name', t.name))
 FROM (${ARTICLE_TAG_UNION} ORDER BY t.name COLLATE NOCASE, t.id) t) AS tags_json`;

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
	if (query.dateFrom) {
		conds.push("report_date >= ?");
		binds.push(query.dateFrom);
	}
	if (query.dateTo) {
		conds.push("report_date <= ?");
		binds.push(query.dateTo);
	}
	if (query.query) {
		conds.push(
			"(instr(lower(title), lower(?)) > 0 OR instr(lower(coalesce(summary, '')), lower(?)) > 0 OR instr(lower(markdown), lower(?)) > 0)",
		);
		binds.push(query.query, query.query, query.query);
	}
	if (query.tagIds.length) {
		conds.push(
			`EXISTS (SELECT 1 FROM (${ARTICLE_TAG_UNION}) matched_tag WHERE matched_tag.id IN (SELECT value FROM json_each(?)))`,
		);
		binds.push(JSON.stringify(query.tagIds));
	}
	if (cursor) {
		conds.push("(report_date < ? OR (report_date = ? AND id < ?))");
		binds.push(cursor.reportDate, cursor.reportDate, cursor.id);
	}
	const { results } = await db
		.prepare(
			`SELECT ${ARTICLE_COLS}, ${ARTICLE_TAGS} FROM channel_articles a
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
			`SELECT a.*, ${ARTICLE_TAGS} FROM channel_articles a
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
			`SELECT a.*, ${ARTICLE_TAGS} FROM channel_articles a
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

export async function updateChannelArticle(
	db: D1Database,
	userId: string,
	channelId: number,
	articleId: number,
	input: ParsedArticle,
): Promise<ChannelArticle | null> {
	const row = await db
		.prepare(`UPDATE channel_articles SET title = ?, report_date = ?, markdown = ?, summary = ?, author = ?
 WHERE id = ? AND channel_id = ? AND user_id = ? RETURNING id`)
		.bind(
			input.title,
			input.reportDate,
			input.markdown,
			input.summary,
			input.author,
			articleId,
			channelId,
			userId,
		)
		.first<{ id: number }>();
	return row ? getChannelArticle(db, userId, channelId, articleId) : null;
}

export async function deleteChannelArticle(
	db: D1Database,
	userId: string,
	channelId: number,
	articleId: number,
): Promise<boolean> {
	const result = await db
		.prepare("DELETE FROM channel_articles WHERE id = ? AND channel_id = ? AND user_id = ?")
		.bind(articleId, channelId, userId)
		.run();
	return result.meta.changes > 0;
}
