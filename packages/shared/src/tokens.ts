import type { Tag } from "./channels.js";

export type TokenKind = "watchlist" | "channel" | "query";
export type QueryTokenAccess = {
	mode: "all" | "selected";
	watchlistIds: number[];
	channelIds: number[];
};
export type QueryTokenInput = { label: string; access: QueryTokenAccess };

export type ManagedToken = {
	kind: TokenKind;
	queryAccess: QueryTokenAccess | null;
	id: number;
	label: string;
	tokenPrefix: string;
	scopes: string[];
	createdAtMs: number;
	lastUsedAtMs: number | null;
	channelId: number | null;
	channelName: string | null;
	tags: Tag[];
};

export const TOKEN_LABEL_MAX = 64;
export const QUERY_TOKEN_SOURCE_MAX = 100;

export function parseQueryTokenAccess(
	raw: unknown,
	allowEmpty = false,
): { ok: true; value: QueryTokenAccess } | { ok: false; error: string } {
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		return { ok: false, error: "invalid access" };
	const o = raw as Record<string, unknown>;
	if (Object.keys(o).some((key) => !["mode", "watchlistIds", "channelIds"].includes(key)))
		return { ok: false, error: "unknown access field" };
	if (o.mode !== "all" && o.mode !== "selected") return { ok: false, error: "invalid access mode" };
	if (!Array.isArray(o.watchlistIds) || !Array.isArray(o.channelIds))
		return { ok: false, error: "source arrays required" };
	const ids = [...o.watchlistIds, ...o.channelIds];
	if (ids.length > QUERY_TOKEN_SOURCE_MAX)
		return { ok: false, error: `at most ${QUERY_TOKEN_SOURCE_MAX} sources` };
	if (ids.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0))
		return { ok: false, error: "invalid source id" };
	if (o.mode === "all" && ids.length)
		return { ok: false, error: "all access must have no source ids" };
	if (o.mode === "selected" && !ids.length && !allowEmpty)
		return { ok: false, error: "select at least one source" };
	return {
		ok: true,
		value: {
			mode: o.mode,
			watchlistIds: [...new Set<number>(o.watchlistIds)].sort((a, b) => a - b),
			channelIds: [...new Set<number>(o.channelIds)].sort((a, b) => a - b),
		},
	};
}

export function parseQueryTokenInput(
	raw: unknown,
): { ok: true; value: QueryTokenInput } | { ok: false; error: string } {
	const label = parseTokenLabel(raw);
	if (!label.ok) return label;
	const o = raw as Record<string, unknown>;
	if (Object.keys(o).some((key) => !["label", "access"].includes(key)))
		return { ok: false, error: "unknown token field" };
	const access = parseQueryTokenAccess(o.access);
	if (!access.ok) return access;
	return { ok: true, value: { label: label.label, access: access.value } };
}

export function parseTokenLabel(
	raw: unknown,
): { ok: true; label: string } | { ok: false; error: string } {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, error: "invalid body" };
	}
	const label = (raw as { label?: unknown }).label;
	if (typeof label !== "string") {
		return { ok: false, error: "label required" };
	}
	const trimmed = label.trim();
	if (!trimmed) return { ok: false, error: "label required" };
	if (trimmed.length > TOKEN_LABEL_MAX) return { ok: false, error: "label too long" };
	return { ok: true, label: trimmed };
}
