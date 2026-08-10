import { isSourceType } from "@xray/shared";
import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import {
	addMember,
	deleteMember,
	listMembers,
	MemberConflictError,
	MemberValidationError,
	updateMember,
} from "../repos/members.js";
import { createTag, listTags } from "../repos/tags.js";
import {
	createWatchlist,
	deleteWatchlist,
	getWatchlist,
	listWatchlists,
	updateWatchlist,
} from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

export async function listWatchlistsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const data = await listWatchlists(c.env.DB, user.id);
	return jsonOk(c, data);
}

export async function createWatchlistRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const body = (await c.req.json().catch(() => null)) as {
		name?: string;
		description?: string | null;
		icon?: string;
		translateEnabled?: boolean;
	} | null;
	if (!body?.name?.trim()) return jsonErr(c, "name required", 400);
	const data = await createWatchlist(c.env.DB, user.id, {
		name: body.name.trim(),
		description: body.description,
		icon: body.icon,
		translateEnabled: body.translateEnabled,
	});
	return jsonOk(c, data, 201);
}

export async function getWatchlistRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const data = await getWatchlist(c.env.DB, user.id, id);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function patchWatchlistRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const body = (await c.req.json().catch(() => null)) as {
		name?: string;
		description?: string | null;
		icon?: string;
		translateEnabled?: boolean;
	} | null;
	if (!body) return jsonErr(c, "invalid body", 400);
	const data = await updateWatchlist(c.env.DB, user.id, id, body);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function deleteWatchlistRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const ok = await deleteWatchlist(c.env.DB, user.id, id);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}

export async function listMembersRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const wl = await getWatchlist(c.env.DB, user.id, id);
	if (!wl) return jsonErr(c, "Not found", 404);
	const data = await listMembers(c.env.DB, user.id, id);
	return jsonOk(c, data);
}

export async function addMemberRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const wl = await getWatchlist(c.env.DB, user.id, id);
	if (!wl) return jsonErr(c, "Not found", 404);
	const body = (await c.req.json().catch(() => null)) as {
		sourceType?: string;
		handle?: string;
		displayName?: string | null;
		note?: string | null;
		externalAuthorId?: string | null;
		tagIds?: number[];
	} | null;
	if (!body?.handle || !isSourceType(body.sourceType)) {
		return jsonErr(c, "sourceType and handle required", 400);
	}
	try {
		const data = await addMember(c.env.DB, user.id, id, {
			sourceType: body.sourceType,
			handle: body.handle,
			displayName: body.displayName,
			note: body.note,
			externalAuthorId: body.externalAuthorId,
			tagIds: body.tagIds,
		});
		return jsonOk(c, data, 201);
	} catch (e) {
		if (e instanceof MemberValidationError) return jsonErr(c, e.message, 400);
		if (e instanceof MemberConflictError) return jsonErr(c, e.message, 409);
		throw e;
	}
}

export async function patchMemberRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const memberId = parseIdParam(c.req.param("memberId"));
	if (!memberId) return jsonErr(c, "invalid member id", 400);
	const body = (await c.req.json().catch(() => null)) as {
		displayName?: string | null;
		note?: string | null;
		tagIds?: number[];
	} | null;
	if (!body) return jsonErr(c, "invalid body", 400);
	const data = await updateMember(c.env.DB, user.id, memberId, body);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function deleteMemberRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const memberId = parseIdParam(c.req.param("memberId"));
	if (!memberId) return jsonErr(c, "invalid member id", 400);
	const ok = await deleteMember(c.env.DB, user.id, memberId);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}

export async function listTagsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	return jsonOk(c, await listTags(c.env.DB, user.id));
}

export async function createTagRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const body = (await c.req.json().catch(() => null)) as { name?: string; color?: string } | null;
	if (!body?.name?.trim()) return jsonErr(c, "name required", 400);
	try {
		const data = await createTag(c.env.DB, user.id, body.name, body.color ?? "hsl(210, 70%, 45%)");
		return jsonOk(c, data, 201);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/UNIQUE|unique/i.test(msg)) return jsonErr(c, "tag exists", 409);
		throw e;
	}
}
