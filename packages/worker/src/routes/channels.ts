import { parseArticleInput, parseArticlePageQuery } from "@xray/shared";
import type { Context } from "hono";
import {
	jsonErr,
	jsonOk,
	parseChannelBody,
	parseIdParam,
	readBoundedBody,
	requireUser,
} from "../lib/http.js";
import { mintPushToken } from "../lib/push-token-crypto.js";
import {
	createChannel,
	deleteChannel,
	deleteChannelArticle,
	getChannel,
	getChannelArticle,
	listChannelArticles,
	listChannels,
	orderChannels,
	updateChannel,
	updateChannelArticle,
} from "../repos/channels.js";
import { createChannelKey, listChannelKeys, revokeChannelKey } from "../repos/push-tokens.js";
import type { AppEnv } from "../types.js";

const MAX_LABEL = 64;

function parseKeyLabel(raw: unknown): { ok: true; label: string } | { ok: false; error: string } {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, error: "invalid body" };
	}
	const label = (raw as { label?: unknown }).label;
	if (typeof label !== "string" || !label.trim()) {
		return { ok: false, error: "label required" };
	}
	return { ok: true, label: label.trim().slice(0, MAX_LABEL) };
}

export async function listChannelsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	return jsonOk(c, await listChannels(c.env.DB, user.id));
}

export async function createChannelRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const parsed = parseChannelBody(await c.req.json().catch(() => null), "create");
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	return jsonOk(
		c,
		await createChannel(c.env.DB, user.id, {
			name: parsed.value.name as string,
			description: parsed.value.description,
		}),
		201,
	);
}

export async function deleteChannelRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	if (!(await deleteChannel(c.env.DB, user.id, id))) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}

export async function orderChannelsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const raw = await c.req.json().catch(() => null);
	if (
		!raw ||
		typeof raw !== "object" ||
		Array.isArray(raw) ||
		Object.keys(raw).some((key) => key !== "ids") ||
		!Array.isArray(raw.ids) ||
		raw.ids.some((id: unknown) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) ||
		new Set(raw.ids).size !== raw.ids.length
	)
		return jsonErr(c, "ids must be unique positive integers", 400);
	const channels = await orderChannels(c.env.DB, user.id, raw.ids);
	if (!channels) return jsonErr(c, "ids must contain every channel exactly once", 400);
	return jsonOk(c, channels);
}

export async function patchChannelRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const parsed = parseChannelBody(await c.req.json().catch(() => null), "patch");
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const data = await updateChannel(c.env.DB, user.id, id, parsed.value);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function listChannelArticlesRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const parsed = parseArticlePageQuerySafe(c);
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	if (!(await getChannel(c.env.DB, user.id, id))) return jsonErr(c, "Not found", 404);
	const page = await listChannelArticles(c.env.DB, user.id, id, parsed.value);
	if (!page) return jsonErr(c, "invalid before", 400);
	return jsonOk(c, page);
}

export async function getChannelArticleRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	const articleId = parseIdParam(c.req.param("articleId"));
	if (!id || !articleId) return jsonErr(c, "invalid id", 400);
	const data = await getChannelArticle(c.env.DB, user.id, id, articleId);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function listChannelKeysRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	if (!(await getChannel(c.env.DB, user.id, id))) return jsonErr(c, "Not found", 404);
	return jsonOk(c, await listChannelKeys(c.env.DB, user.id, id));
}

export async function createChannelKeyRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	if (!(await getChannel(c.env.DB, user.id, id))) return jsonErr(c, "Not found", 404);
	const parsed = parseKeyLabel(await c.req.json().catch(() => null));
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const minted = await mintPushToken();
	const key = await createChannelKey(
		c.env.DB,
		user.id,
		id,
		parsed.label,
		minted.tokenPrefix,
		minted.tokenHash,
	);
	return jsonOk(c, { ...key, token: minted.plaintext }, 201);
}

export async function revokeChannelKeyRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	const keyId = parseIdParam(c.req.param("keyId"));
	if (!id || !keyId) return jsonErr(c, "invalid id", 400);
	if (!(await getChannel(c.env.DB, user.id, id))) return jsonErr(c, "Not found", 404);
	const ok = await revokeChannelKey(c.env.DB, user.id, id, keyId);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { revoked: true });
}

function parseArticlePageQuerySafe(c: Context<AppEnv>): ReturnType<typeof parseArticlePageQuery> {
	const q = c.req.query();
	return parseArticlePageQuery({
		date_from: q.date_from,
		date_to: q.date_to,
		q: q.q,
		tag_ids: q.tag_ids,
		before: q.before,
		limit: q.limit,
	});
}

export async function patchChannelArticleRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	const articleId = parseIdParam(c.req.param("articleId"));
	if (!id || !articleId) return jsonErr(c, "invalid id", 400);
	const body = await readBoundedBody(c, 1_048_576);
	if (!body.ok) return jsonErr(c, body.error, body.status);
	let raw: unknown;
	try {
		raw = JSON.parse(body.text);
	} catch {
		return jsonErr(c, "invalid JSON", 400);
	}
	if (
		!raw ||
		typeof raw !== "object" ||
		Array.isArray(raw) ||
		Object.keys(raw).some(
			(k) => !["title", "report_date", "markdown", "summary", "author"].includes(k),
		)
	)
		return jsonErr(c, "invalid article fields", 400);
	const existing = await getChannelArticle(c.env.DB, user.id, id, articleId);
	if (!existing) return jsonErr(c, "Not found", 404);
	const parsed = parseArticleInput({ ...raw, external_id: existing.externalId });
	if (!parsed.ok) return jsonErr(c, parsed.error, parsed.status);
	const updated = await updateChannelArticle(c.env.DB, user.id, id, articleId, parsed.value);
	return updated ? jsonOk(c, updated) : jsonErr(c, "Not found", 404);
}

export async function deleteChannelArticleRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	const articleId = parseIdParam(c.req.param("articleId"));
	if (!id || !articleId) return jsonErr(c, "invalid id", 400);
	return (await deleteChannelArticle(c.env.DB, user.id, id, articleId))
		? jsonOk(c, { deleted: true })
		: jsonErr(c, "Not found", 404);
}
