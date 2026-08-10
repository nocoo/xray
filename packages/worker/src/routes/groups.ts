import { isSourceType } from "@xray/shared";
import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import {
	addGroupMember,
	createGroup,
	deleteGroup,
	deleteGroupMember,
	getGroup,
	listGroupMembers,
	listGroups,
	updateGroup,
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
	const body = (await c.req.json().catch(() => null)) as {
		name?: string;
		description?: string | null;
		icon?: string;
	} | null;
	if (!body?.name?.trim()) return jsonErr(c, "name required", 400);
	return jsonOk(
		c,
		await createGroup(c.env.DB, user.id, {
			name: body.name.trim(),
			description: body.description,
			icon: body.icon,
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
	const body = (await c.req.json().catch(() => null)) as {
		name?: string;
		description?: string | null;
		icon?: string;
	} | null;
	if (!body) return jsonErr(c, "invalid body", 400);
	const data = await updateGroup(c.env.DB, user.id, id, body);
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
	const body = (await c.req.json().catch(() => null)) as {
		sourceType?: string;
		handle?: string;
		displayName?: string | null;
		externalAuthorId?: string | null;
	} | null;
	if (!body?.handle || !isSourceType(body.sourceType)) {
		return jsonErr(c, "sourceType and handle required", 400);
	}
	try {
		const data = await addGroupMember(c.env.DB, user.id, id, {
			sourceType: body.sourceType,
			handle: body.handle,
			displayName: body.displayName,
			externalAuthorId: body.externalAuthorId,
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
	const memberId = parseIdParam(c.req.param("memberId"));
	if (!memberId) return jsonErr(c, "invalid member id", 400);
	const ok = await deleteGroupMember(c.env.DB, user.id, memberId);
	if (!ok) return jsonErr(c, "Not found", 404);
	return jsonOk(c, { deleted: true });
}
