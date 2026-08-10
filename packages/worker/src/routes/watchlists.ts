import { isSourceType } from "@xray/shared";
import type { Context } from "hono";
import {
	jsonErr,
	jsonOk,
	parseIdParam,
	parseMemberCreateBody,
	parseMemberPatchBody,
	parseTagBody,
	parseWatchlistBody,
	requireUser,
} from "../lib/http.js";
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
	const parsed = parseWatchlistBody(await c.req.json().catch(() => null), "create");
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const data = await createWatchlist(c.env.DB, user.id, {
		name: parsed.value.name as string,
		description: parsed.value.description,
		icon: parsed.value.icon,
		translateEnabled: parsed.value.translateEnabled,
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
	const parsed = parseWatchlistBody(await c.req.json().catch(() => null), "patch");
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const data = await updateWatchlist(c.env.DB, user.id, id, parsed.value);
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
	const parsed = parseMemberCreateBody(await c.req.json().catch(() => null));
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	if (!isSourceType(parsed.value.sourceType)) {
		return jsonErr(c, "sourceType and handle required", 400);
	}
	try {
		const data = await addMember(c.env.DB, user.id, id, {
			sourceType: parsed.value.sourceType,
			handle: parsed.value.handle,
			displayName: parsed.value.displayName,
			note: parsed.value.note,
			externalAuthorId: parsed.value.externalAuthorId,
			tagIds: parsed.value.tagIds,
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
	const wlId = parseIdParam(c.req.param("id"));
	const memberId = parseIdParam(c.req.param("memberId"));
	if (!wlId || !memberId) return jsonErr(c, "invalid id", 400);
	const parsed = parseMemberPatchBody(await c.req.json().catch(() => null));
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const data = await updateMember(c.env.DB, user.id, memberId, parsed.value, {
		watchlistId: wlId,
	});
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function deleteMemberRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const wlId = parseIdParam(c.req.param("id"));
	const memberId = parseIdParam(c.req.param("memberId"));
	if (!wlId || !memberId) return jsonErr(c, "invalid id", 400);
	const ok = await deleteMember(c.env.DB, user.id, memberId, { watchlistId: wlId });
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
	const parsed = parseTagBody(await c.req.json().catch(() => null));
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	try {
		const data = await createTag(c.env.DB, user.id, parsed.value.name, parsed.value.color);
		return jsonOk(c, data, 201);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/UNIQUE|unique/i.test(msg)) return jsonErr(c, "tag exists", 409);
		throw e;
	}
}
