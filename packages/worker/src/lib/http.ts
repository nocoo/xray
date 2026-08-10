import type { Context } from "hono";
import type { AppEnv, AuthUser } from "../types.js";

export function requireUser(c: Context<AppEnv>): AuthUser | Response {
	const user = c.get("authUser");
	if (!user) return c.json({ error: "Unauthorized" }, 401);
	return user;
}

export function jsonOk<T>(c: Context<AppEnv>, data: T, status: 200 | 201 = 200) {
	return c.json({ success: true, data }, status);
}

export function jsonErr(c: Context<AppEnv>, error: string, status: 400 | 403 | 404 | 409 | 500) {
	return c.json({ success: false, error }, status);
}

export function parseIdParam(raw: string | undefined): number | null {
	if (!raw) return null;
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0) return null;
	return n;
}

const MAX_NAME = 120;
const MAX_DESC = 2000;
const MAX_ICON = 64;
const MAX_HANDLE = 64;
const MAX_NOTE = 2000;
const MAX_TAGS = 50;

export type ParseFail = { ok: false; error: string };
export type ParseOk<T> = { ok: true; value: T };

function asObject(raw: unknown): Record<string, unknown> | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	return raw as Record<string, unknown>;
}

function optString(
	v: unknown,
	field: string,
	max: number,
	opts?: { allowNull?: boolean; allowEmpty?: boolean },
): ParseFail | { ok: true; value: string | null | undefined } {
	if (v === undefined) return { ok: true, value: undefined };
	if (v === null) {
		if (opts?.allowNull) return { ok: true, value: null };
		return { ok: false, error: `${field} invalid` };
	}
	if (typeof v !== "string") return { ok: false, error: `${field} must be string` };
	if (v.length > max) return { ok: false, error: `${field} too long` };
	const t = v.trim();
	if (!t && !opts?.allowEmpty) {
		if (opts?.allowNull) return { ok: true, value: null };
		return { ok: false, error: `${field} required` };
	}
	return { ok: true, value: t || null };
}

function optBool(v: unknown, field: string): ParseFail | { ok: true; value: boolean | undefined } {
	if (v === undefined) return { ok: true, value: undefined };
	if (typeof v !== "boolean") return { ok: false, error: `${field} must be boolean` };
	return { ok: true, value: v };
}

function optTagIds(v: unknown): ParseFail | { ok: true; value: number[] | undefined } {
	if (v === undefined) return { ok: true, value: undefined };
	if (!Array.isArray(v) || v.length > MAX_TAGS) return { ok: false, error: "tagIds invalid" };
	const out: number[] = [];
	for (const x of v) {
		if (typeof x !== "number" || !Number.isInteger(x) || x <= 0) {
			return { ok: false, error: "tagIds invalid" };
		}
		out.push(x);
	}
	return { ok: true, value: out };
}

export function parseWatchlistBody(
	raw: unknown,
	mode: "create" | "patch",
):
	| ParseOk<{
			name?: string;
			description?: string | null;
			icon?: string;
			translateEnabled?: boolean;
	  }>
	| ParseFail {
	const o = asObject(raw);
	if (!o) return { ok: false, error: "invalid body" };
	const name = optString(o.name, "name", MAX_NAME, { allowEmpty: false });
	if (!name.ok) return name;
	const description = optString(o.description, "description", MAX_DESC, {
		allowNull: true,
		allowEmpty: true,
	});
	if (!description.ok) return description;
	const icon = optString(o.icon, "icon", MAX_ICON);
	if (!icon.ok) return icon;
	const translateEnabled = optBool(o.translateEnabled, "translateEnabled");
	if (!translateEnabled.ok) return translateEnabled;
	if (mode === "create") {
		if (!name.value) return { ok: false, error: "name required" };
		return {
			ok: true,
			value: {
				name: name.value,
				description: description.value ?? null,
				icon: icon.value ?? undefined,
				translateEnabled: translateEnabled.value,
			},
		};
	}
	if (
		name.value === undefined &&
		description.value === undefined &&
		icon.value === undefined &&
		translateEnabled.value === undefined
	) {
		return { ok: false, error: "empty update" };
	}
	return {
		ok: true,
		value: {
			name: name.value ?? undefined,
			description: description.value,
			icon: icon.value ?? undefined,
			translateEnabled: translateEnabled.value,
		},
	};
}

export function parseGroupBody(
	raw: unknown,
	mode: "create" | "patch",
):
	| ParseOk<{
			name?: string;
			description?: string | null;
			icon?: string;
	  }>
	| ParseFail {
	const o = asObject(raw);
	if (!o) return { ok: false, error: "invalid body" };
	const name = optString(o.name, "name", MAX_NAME);
	if (!name.ok) return name;
	const description = optString(o.description, "description", MAX_DESC, {
		allowNull: true,
		allowEmpty: true,
	});
	if (!description.ok) return description;
	const icon = optString(o.icon, "icon", MAX_ICON);
	if (!icon.ok) return icon;
	if (mode === "create") {
		if (!name.value) return { ok: false, error: "name required" };
		return {
			ok: true,
			value: {
				name: name.value,
				description: description.value ?? null,
				icon: icon.value ?? undefined,
			},
		};
	}
	if (name.value === undefined && description.value === undefined && icon.value === undefined) {
		return { ok: false, error: "empty update" };
	}
	return {
		ok: true,
		value: {
			name: name.value ?? undefined,
			description: description.value,
			icon: icon.value ?? undefined,
		},
	};
}

export function parseMemberCreateBody(raw: unknown):
	| ParseOk<{
			sourceType: string;
			handle: string;
			displayName?: string | null;
			note?: string | null;
			externalAuthorId?: string | null;
			tagIds?: number[];
	  }>
	| ParseFail {
	const o = asObject(raw);
	if (!o) return { ok: false, error: "invalid body" };
	if (typeof o.sourceType !== "string") return { ok: false, error: "sourceType required" };
	const handle = optString(o.handle, "handle", MAX_HANDLE);
	if (!handle.ok) return handle;
	if (!handle.value) return { ok: false, error: "handle required" };
	const displayName = optString(o.displayName, "displayName", MAX_NAME, {
		allowNull: true,
		allowEmpty: true,
	});
	if (!displayName.ok) return displayName;
	const note = optString(o.note, "note", MAX_NOTE, { allowNull: true, allowEmpty: true });
	if (!note.ok) return note;
	const externalAuthorId = optString(o.externalAuthorId, "externalAuthorId", 128, {
		allowNull: true,
		allowEmpty: true,
	});
	if (!externalAuthorId.ok) return externalAuthorId;
	const tagIds = optTagIds(o.tagIds);
	if (!tagIds.ok) return tagIds;
	return {
		ok: true,
		value: {
			sourceType: o.sourceType,
			handle: handle.value,
			displayName: displayName.value,
			note: note.value,
			externalAuthorId: externalAuthorId.value,
			tagIds: tagIds.value,
		},
	};
}

export function parseMemberPatchBody(raw: unknown):
	| ParseOk<{
			displayName?: string | null;
			note?: string | null;
			tagIds?: number[];
	  }>
	| ParseFail {
	const o = asObject(raw);
	if (!o) return { ok: false, error: "invalid body" };
	const displayName = optString(o.displayName, "displayName", MAX_NAME, {
		allowNull: true,
		allowEmpty: true,
	});
	if (!displayName.ok) return displayName;
	const note = optString(o.note, "note", MAX_NOTE, { allowNull: true, allowEmpty: true });
	if (!note.ok) return note;
	const tagIds = optTagIds(o.tagIds);
	if (!tagIds.ok) return tagIds;
	if (displayName.value === undefined && note.value === undefined && tagIds.value === undefined) {
		return { ok: false, error: "empty update" };
	}
	return {
		ok: true,
		value: {
			displayName: displayName.value,
			note: note.value,
			tagIds: tagIds.value,
		},
	};
}

export function parseTagBody(raw: unknown): ParseOk<{ name: string; color: string }> | ParseFail {
	const o = asObject(raw);
	if (!o) return { ok: false, error: "invalid body" };
	const name = optString(o.name, "name", MAX_NAME);
	if (!name.ok) return name;
	if (!name.value) return { ok: false, error: "name required" };
	const color = optString(o.color, "color", 64, { allowEmpty: true });
	if (!color.ok) return color;
	return {
		ok: true,
		value: { name: name.value, color: color.value || "hsl(210, 70%, 45%)" },
	};
}
