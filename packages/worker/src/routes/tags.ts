import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, parseTagBody, requireUser } from "../lib/http.js";
import { deleteTag, renameTag, replaceChannelTags } from "../repos/tags.js";
import type { AppEnv } from "../types.js";

export async function patchTagRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const raw = await c.req.json().catch(() => null);
	if (
		!raw ||
		typeof raw !== "object" ||
		Array.isArray(raw) ||
		Object.keys(raw).some((k) => k !== "name")
	)
		return jsonErr(c, "only name is allowed", 400);
	const parsed = parseTagBody(raw);
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	try {
		const tag = await renameTag(c.env.DB, user.id, id, parsed.value.name);
		return tag ? jsonOk(c, tag) : jsonErr(c, "Not found", 404);
	} catch (error) {
		if (/UNIQUE/i.test(String(error))) return jsonErr(c, "tag exists", 409);
		throw error;
	}
}

export async function deleteTagRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	return (await deleteTag(c.env.DB, user.id, id))
		? jsonOk(c, { deleted: true })
		: jsonErr(c, "Not found", 404);
}

export async function putChannelTagsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	const keyParam = c.req.param("keyId");
	const keyId = keyParam === undefined ? undefined : parseIdParam(keyParam);
	if (!id || keyId === null) return jsonErr(c, "invalid id", 400);
	const raw = await c.req.json().catch(() => null);
	if (
		!raw ||
		typeof raw !== "object" ||
		Array.isArray(raw) ||
		Object.keys(raw).some((k) => k !== "tagIds") ||
		!Array.isArray(raw.tagIds) ||
		raw.tagIds.length > 20 ||
		raw.tagIds.some(
			(id: unknown) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0,
		) ||
		new Set(raw.tagIds).size !== raw.tagIds.length
	)
		return jsonErr(c, "tagIds must be at most 20 unique positive integers", 400);
	const tags = await replaceChannelTags(c.env.DB, user.id, id, raw.tagIds, keyId);
	return tags ? jsonOk(c, tags) : jsonErr(c, "invalid parent or tag ids", 400);
}
