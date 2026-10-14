import type { Tag } from "./channels.js";

export type ManagedToken = {
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
