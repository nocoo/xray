import type {
	ContentQuery,
	QueryArticle,
	QueryItem,
	QueryPage,
	QueryPost,
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
	access: QueryTokenAccess,
	query: ContentQuery,
	position: QueryPosition | null,
	context: QueryCursorContext,
): Promise<QueryPage> {
	const all = access.mode === "all";
	const conds: string[] = [];
	const binds: unknown[] = [
		userId,
		all ? 1 : 0,
		JSON.stringify(access.watchlistIds),
		userId,
		all ? 1 : 0,
		JSON.stringify(access.channelIds),
		context.tokenId,
		userId,
		context.accessJson,
	];
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
		conds.push(`(time_ms, kind, id) ${op} (?, ?, ?)`);
		binds.push(position.timeMs, position.kind, position.id);
	}
	binds.push(query.limit + 1);
	const { results } = await db
		.prepare(`WITH content AS (
 SELECT p.id, p.created_at_ms AS time_ms, 'post' AS kind
 FROM items p JOIN watchlists w ON w.id = p.watchlist_id AND w.user_id = p.user_id
 WHERE p.user_id = ? AND (? = 1 OR p.watchlist_id IN (SELECT value FROM json_each(?)))
 UNION ALL
 SELECT a.id, CAST(strftime('%s', a.report_date || 'T00:00:00Z') AS INTEGER) * 1000 AS time_ms, 'article' AS kind
 FROM channel_articles a JOIN channels c ON c.id = a.channel_id AND c.user_id = a.user_id
 WHERE a.user_id = ? AND (? = 1 OR a.channel_id IN (SELECT value FROM json_each(?)))
 ), page AS MATERIALIZED (
 SELECT * FROM content
 WHERE EXISTS (SELECT 1 FROM push_tokens WHERE id = ? AND user_id = ? AND revoked_at_ms IS NULL AND query_access = ?)
 ${conds.map((cond) => `AND ${cond}`).join(" ")}
 ORDER BY time_ms ${query.order}, kind ${query.order}, id ${query.order} LIMIT ?
 ) SELECT q.id AS id, q.time_ms AS time_ms, q.kind AS kind,
 json_object('id', p.id, 'watchlistId', p.watchlist_id, 'sourceType', p.source_type,
 'externalId', p.external_id, 'authorUsername', p.author_username, 'title', p.title,
 'text', p.text, 'createdAtMs', p.created_at_ms,
 'payload', json(CASE WHEN json_valid(p.payload_json) THEN p.payload_json ELSE 'null' END),
 'translatedText', p.translated_text, 'quotedTranslatedText', p.quoted_translated_text,
 'summaryText', p.summary_text) AS data_json
 FROM page q JOIN items p ON p.id = q.id AND q.kind = 'post'
 UNION ALL
 SELECT q.id AS id, q.time_ms AS time_ms, q.kind AS kind,
 json_object('id', a.id, 'channelId', a.channel_id, 'externalId', a.external_id,
 'title', a.title, 'reportDate', a.report_date, 'summary', a.summary, 'author', a.author,
 'markdown', a.markdown, 'sourceLabel', a.source_label, 'createdAtMs', a.created_at_ms) AS data_json
 FROM page q JOIN channel_articles a ON a.id = q.id AND q.kind = 'article'
 ORDER BY time_ms ${query.order}, kind ${query.order}, id ${query.order}`)
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
