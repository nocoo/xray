import { isValidReportDate } from "./channels.js";
import type { SourceType } from "./source.js";

export type QueryPost = {
	id: number;
	watchlistId: number;
	sourceType: SourceType;
	externalId: string;
	authorUsername: string | null;
	title: string | null;
	text: string;
	createdAtMs: number;
	payload: unknown;
	translatedText: string | null;
	quotedTranslatedText: string | null;
	summaryText: string | null;
};

export type QueryArticle = {
	id: number;
	channelId: number;
	externalId: string;
	title: string;
	reportDate: string;
	summary: string | null;
	author: string | null;
	markdown: string;
	sourceLabel: string;
	createdAtMs: number;
};

export type QueryItem =
	| { kind: "post"; timeMs: number; post: QueryPost }
	| { kind: "article"; timeMs: number; article: QueryArticle };
export type QueryPage = { items: QueryItem[]; nextCursor: string | null };
export type ContentQuery = {
	startMs: number | null;
	endMs: number | null;
	order: "asc" | "desc";
	limit: number;
	cursor: string | null;
};

function utcTime(raw: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw)) return null;
	if (!isValidReportDate(raw.slice(0, 10))) return null;
	if (
		Number(raw.slice(11, 13)) > 23 ||
		Number(raw.slice(14, 16)) > 59 ||
		Number(raw.slice(17, 19)) > 59
	)
		return null;
	return Date.parse(raw);
}

export function parseContentQuery(
	raw: Record<string, string>,
): { ok: true; value: ContentQuery } | { ok: false; error: string } {
	if (Object.keys(raw).some((key) => !["start", "end", "order", "limit", "cursor"].includes(key)))
		return { ok: false, error: "unknown query parameter" };
	const startMs = raw.start === undefined ? null : utcTime(raw.start);
	const endMs = raw.end === undefined ? null : utcTime(raw.end);
	if ((raw.start !== undefined && startMs === null) || (raw.end !== undefined && endMs === null))
		return { ok: false, error: "start/end must be RFC3339 UTC timestamps" };
	if (startMs !== null && endMs !== null && startMs >= endMs)
		return { ok: false, error: "start must precede end" };
	const order = raw.order ?? "desc";
	if (order !== "asc" && order !== "desc") return { ok: false, error: "invalid order" };
	const limit = raw.limit === undefined ? 100 : Number(raw.limit);
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		return { ok: false, error: "limit must be 1..100" };
	const cursor = raw.cursor ?? null;
	if (cursor !== null && (!cursor || cursor.length > 2048))
		return { ok: false, error: "invalid cursor" };
	return { ok: true, value: { startMs, endMs, order, limit, cursor } };
}
