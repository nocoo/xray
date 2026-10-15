import type { ContentQuery } from "@xray/shared";
import { timingSafeEqual } from "./push-token-crypto.js";

export type QueryPosition = { timeMs: number; kind: "article" | "post"; id: number };
export type QueryCursorContext = {
	tokenId: number;
	accessJson: string;
	query: ContentQuery;
	key: string;
};

async function signature(body: string, context: QueryCursorContext): Promise<string> {
	const { startMs, endMs, order } = context.query;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(context.key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signed = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(
			JSON.stringify([body, context.tokenId, context.accessJson, startMs, endMs, order]),
		),
	);
	return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encodeQueryCursor(
	position: QueryPosition,
	context: QueryCursorContext,
): Promise<string> {
	const body = btoa(JSON.stringify([1, position.timeMs, position.kind, position.id]))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `${body}.${await signature(body, context)}`;
}

export async function decodeQueryCursor(
	cursor: string,
	context: QueryCursorContext,
): Promise<QueryPosition | null> {
	try {
		const [body, mac, extra] = cursor.split(".");
		if (
			!body ||
			!mac ||
			extra !== undefined ||
			!/^[A-Za-z0-9_-]+$/.test(body) ||
			!/^[a-f0-9]{64}$/.test(mac)
		)
			return null;
		if (!timingSafeEqual(mac, await signature(body, context))) return null;
		const parsed: unknown = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
		if (!Array.isArray(parsed) || parsed.length !== 4) return null;
		const [version, timeMs, kind, id] = parsed;
		if (
			version !== 1 ||
			!Number.isSafeInteger(timeMs) ||
			!Number.isSafeInteger(id) ||
			id <= 0 ||
			(kind !== "article" && kind !== "post")
		)
			return null;
		return { timeMs, kind, id };
	} catch {
		return null;
	}
}
