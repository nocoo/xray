import { isSourceType, parseMemberImportText } from "@xray/shared";
import type { Context } from "hono";
import {
	jsonErr,
	jsonOk,
	parseGroupBody,
	parseIdParam,
	parseMemberCreateBody,
	requireUser,
} from "../lib/http.js";
import {
	addGroupMember,
	bulkImportGroupMembers,
	copyGroupMembersToWatchlist,
	createGroup,
	deleteGroup,
	deleteGroupMember,
	GroupNotFoundError,
	getGroup,
	listGroupMembers,
	listGroups,
	updateGroup,
	WatchlistNotFoundError,
} from "../repos/groups.js";
import type { AppEnv } from "../types.js";

export async function listGroupsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	return jsonOk(c, await listGroups(c.env.DB, user.id));
}

export async function createGroupRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const parsed = parseGroupBody(await c.req.json().catch(() => null), "create");
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	return jsonOk(
		c,
		await createGroup(c.env.DB, user.id, {
			name: parsed.value.name as string,
			description: parsed.value.description,
			icon: parsed.value.icon,
		}),
		201,
	);
}

export async function getGroupRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const data = await getGroup(c.env.DB, user.id, id);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function patchGroupRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const parsed = parseGroupBody(await c.req.json().catch(() => null), "patch");
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	const data = await updateGroup(c.env.DB, user.id, id, parsed.value);
	if (!data) return jsonErr(c, "Not found", 404);
	return jsonOk(c, data);
}

export async function deleteGroupRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const ok = await deleteGroup(c.env.DB, user.id, id);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}

export async function listGroupMembersRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const g = await getGroup(c.env.DB, user.id, id);
	if (!g) return jsonErr(c, "Not found", 404);
	return jsonOk(c, await listGroupMembers(c.env.DB, user.id, id));
}

export async function addGroupMemberRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const g = await getGroup(c.env.DB, user.id, id);
	if (!g) return jsonErr(c, "Not found", 404);
	const parsed = parseMemberCreateBody(await c.req.json().catch(() => null));
	if (!parsed.ok) return jsonErr(c, parsed.error, 400);
	if (!isSourceType(parsed.value.sourceType)) {
		return jsonErr(c, "sourceType and handle required", 400);
	}
	try {
		const data = await addGroupMember(c.env.DB, user.id, id, {
			sourceType: parsed.value.sourceType,
			handle: parsed.value.handle,
			displayName: parsed.value.displayName,
			externalAuthorId: parsed.value.externalAuthorId,
		});
		return jsonOk(c, data, 201);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/UNIQUE|unique/i.test(msg)) return jsonErr(c, "member exists", 409);
		if (msg.includes("handle")) return jsonErr(c, msg, 400);
		throw e;
	}
}

export async function deleteGroupMemberRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const groupId = parseIdParam(c.req.param("id"));
	const memberId = parseIdParam(c.req.param("memberId"));
	if (!groupId || !memberId) return jsonErr(c, "invalid id", 400);
	const ok = await deleteGroupMember(c.env.DB, user.id, memberId, { groupId });
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}

/** POST /api/groups/:id/members/import — body: { text: string } Twitter export or handle list */
export async function bulkImportGroupMembersRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const raw = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return jsonErr(c, "invalid body", 400);
	}
	const text = (raw as { text?: unknown }).text;
	if (typeof text !== "string" || !text.trim()) {
		return jsonErr(c, "text required (export file contents or one handle per line)", 400);
	}
	const seeds = parseMemberImportText(text);
	if (!seeds?.length) return jsonErr(c, "no members found in text", 400);
	if (seeds.length > 500) return jsonErr(c, "max 500 members per import", 400);
	try {
		const data = await bulkImportGroupMembers(c.env.DB, user.id, id, seeds);
		return jsonOk(c, data);
	} catch (e) {
		if (e instanceof GroupNotFoundError) return jsonErr(c, "Not found", 404);
		throw e;
	}
}

/** POST /api/groups/:id/copy-to-watchlist — body: { watchlistId, memberIds? } */
export async function copyGroupToWatchlistRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const id = parseIdParam(c.req.param("id"));
	if (!id) return jsonErr(c, "invalid id", 400);
	const raw = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return jsonErr(c, "invalid body", 400);
	}
	const body = raw as { watchlistId?: unknown; memberIds?: unknown };
	const watchlistId =
		typeof body.watchlistId === "number" && Number.isInteger(body.watchlistId)
			? body.watchlistId
			: typeof body.watchlistId === "string"
				? Number(body.watchlistId)
				: NaN;
	if (!Number.isInteger(watchlistId) || watchlistId <= 0) {
		return jsonErr(c, "watchlistId required", 400);
	}
	let memberIds: number[] | undefined;
	if (body.memberIds !== undefined) {
		if (!Array.isArray(body.memberIds) || !body.memberIds.every((x) => Number.isInteger(x))) {
			return jsonErr(c, "memberIds must be integer array", 400);
		}
		memberIds = body.memberIds as number[];
	}
	try {
		const data = await copyGroupMembersToWatchlist(c.env.DB, user.id, id, watchlistId, {
			memberIds,
		});
		return jsonOk(c, data);
	} catch (e) {
		if (e instanceof GroupNotFoundError || e instanceof WatchlistNotFoundError) {
			return jsonErr(c, "Not found", 404);
		}
		throw e;
	}
}
