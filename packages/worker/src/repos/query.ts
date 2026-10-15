import type {
	ContentQuery,
	QueryArticle,
	QueryItem,
	QueryPage,
	QueryPost,
	QuerySources,
	QueryTokenAccess,
} from "@xray/shared";
import {
	encodeQueryCursor,
	type QueryCursorContext,
	type QueryPosition,
} from "../lib/query-cursor.js";

export async function queryContent(
	db: D1Database,
	userId: string,
	query: ContentQuery,
	position: QueryPosition | null,
	context: QueryCursorContext,
): Promise<QueryPage | null> {
	const post = query.source.kind === "watchlist";
	const parent = post ? "watchlists" : "channels";
	const table = post ? "items" : "channel_articles";
	const foreignKey = post ? "watchlist_id" : "channel_id";
	const kind = post ? "post" : "article";
	const time = post
		? "created_at_ms"
		: "CAST(strftime('%s', report_date || 'T00:00:00Z') AS INTEGER) * 1000";
	const source = await db
		.prepare(`SELECT id FROM ${parent} WHERE id = ? AND user_id = ?`)
		.bind(query.source.id, userId)
		.first();
	if (!source) return null;
	const conds: string[] = [];
	const binds: unknown[] = [userId, query.source.id, context.tokenId, userId, context.accessJson];
	if (query.startMs !== null) {
		conds.push("time_ms >= ?");
		binds.push(query.startMs);
	}
	if (query.endMs !== null) {
		conds.push("time_ms < ?");
		binds.push(query.endMs);
	}
	const op = query.order === "asc" ? ">" : "<";
	if (position) {
		conds.push(`(time_ms, id) ${op} (?, ?)`);
		binds.push(position.timeMs, position.id);
	}
	binds.push(query.limit + 1);
	const { results } = await db
		.prepare(`WITH content AS (
 SELECT id, ${time} AS time_ms FROM ${table}
 WHERE user_id = ? AND ${foreignKey} = ?
 ), page AS MATERIALIZED (
 SELECT * FROM content
 WHERE EXISTS (SELECT 1 FROM push_tokens WHERE id = ? AND user_id = ? AND revoked_at_ms IS NULL AND query_access = ?)
 ${conds.map((cond) => `AND ${cond}`).join(" ")}
 ORDER BY time_ms ${query.order}, id ${query.order} LIMIT ?
 ) SELECT q.id AS id, q.time_ms AS time_ms, '${kind}' AS kind,
 ${
		post
			? `
 json_object('id', p.id, 'watchlistId', p.watchlist_id, 'sourceType', p.source_type,
 'externalId', p.external_id, 'authorUsername', p.author_username, 'title', p.title,
 'text', p.text, 'createdAtMs', p.created_at_ms,
 'payload', json(CASE WHEN json_valid(p.payload_json) THEN p.payload_json ELSE 'null' END),
 'translatedText', p.translated_text, 'quotedTranslatedText', p.quoted_translated_text,
 'summaryText', p.summary_text)`
			: `
 json_object('id', a.id, 'channelId', a.channel_id, 'externalId', a.external_id,
 'title', a.title, 'reportDate', a.report_date, 'summary', a.summary, 'author', a.author,
 'markdown', a.markdown, 'sourceLabel', a.source_label, 'createdAtMs', a.created_at_ms)`
 } AS data_json
 FROM page q JOIN ${table} ${post ? "p" : "a"} ON ${post ? "p" : "a"}.id = q.id
 ORDER BY q.time_ms ${query.order}, q.id ${query.order}`)
		.bind(...binds)
		.all<{ id: number; time_ms: number; kind: "article" | "post"; data_json: string }>();
	const rows = results ?? [];
	const page = rows.slice(0, query.limit);
	const items: QueryItem[] = page.map((row) =>
		row.kind === "post"
			? { kind: "post", timeMs: row.time_ms, post: JSON.parse(row.data_json) as QueryPost }
			: {
					kind: "article",
					timeMs: row.time_ms,
					article: JSON.parse(row.data_json) as QueryArticle,
				},
	);
	const last = page[page.length - 1];
	return {
		items,
		nextCursor:
			rows.length > query.limit && last
				? await encodeQueryCursor({ timeMs: last.time_ms, kind: last.kind, id: last.id }, context)
				: null,
	};
}

export async function listQuerySources(
	db: D1Database,
	userId: string,
	access: QueryTokenAccess,
	tokenId: number,
	accessJson: string,
): Promise<QuerySources> {
	const statements = (["watchlists", "channels"] as const).map((table) =>
		db
			.prepare(`
 SELECT id, name FROM ${table} WHERE user_id = ?
 AND (? = 1 OR id IN (SELECT value FROM json_each(?)))
 AND EXISTS (SELECT 1 FROM push_tokens WHERE id = ? AND user_id = ? AND revoked_at_ms IS NULL AND query_access = ?)
 ORDER BY id`)
			.bind(
				userId,
				access.mode === "all" ? 1 : 0,
				JSON.stringify(table === "watchlists" ? access.watchlistIds : access.channelIds),
				tokenId,
				userId,
				accessJson,
			),
	);
	const [watchlists, channels] = await db.batch<{ id: number; name: string }>(statements);
	return { watchlists: watchlists?.results ?? [], channels: channels?.results ?? [] };
}
