import type { Context } from "hono";
import { jsonErr, jsonOk, requireUser } from "../lib/http.js";
import {
	decryptZhetoWebhookUrl,
	getZhetoSettings,
	IntegrationValidationError,
	upsertZhetoSettings,
} from "../repos/integration-secrets.js";
import type { AppEnv, ZhetoUpstream } from "../types.js";

export type { ZhetoUpstream };

export const defaultZhetoUpstream: ZhetoUpstream = async (webhookUrl, body) => {
	const res = await fetch(webhookUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	let json: Record<string, unknown> = {};
	try {
		json = (await res.json()) as Record<string, unknown>;
	} catch {
		json = {};
	}
	return { status: res.status, json };
};

export async function getZhetoSettingsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	return jsonOk(c, await getZhetoSettings(c.env.DB, user.id));
}

export async function putZhetoSettingsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const raw = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return jsonErr(c, "invalid body", 400);
	}
	const body = raw as Record<string, unknown>;
	try {
		const data = await upsertZhetoSettings(
			c.env.DB,
			user.id,
			{
				webhookUrl: typeof body.webhookUrl === "string" ? body.webhookUrl : undefined,
				folder:
					typeof body.folder === "string" ? body.folder : body.folder === null ? null : undefined,
			},
			c.env,
		);
		return jsonOk(c, data);
	} catch (e) {
		if (e instanceof IntegrationValidationError) return jsonErr(c, e.message, 400);
		if (e instanceof Error && /KEK/i.test(e.message)) {
			const msg = e.message;
			if (/missing/i.test(msg)) return jsonErr(c, "secrets KEK not configured", 500);
			if (/32 bytes|exactly/i.test(msg)) {
				return jsonErr(c, "secrets KEK invalid (need 32-byte raw or base64)", 500);
			}
			return jsonErr(c, `secrets KEK error: ${msg}`, 500);
		}
		throw e;
	}
}

export async function zhetoSaveRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const raw = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return jsonErr(c, "invalid body", 400);
	}
	const body = raw as Record<string, unknown>;
	if (typeof body.url !== "string" || !body.url.trim()) {
		return jsonErr(c, "url required", 400);
	}
	const url = body.url.trim();
	const note =
		typeof body.note === "string" ? body.note.trim().slice(0, 500) || undefined : undefined;
	const folderOverride =
		typeof body.folder === "string" ? body.folder.trim().slice(0, 50) || undefined : undefined;

	let creds: { webhookUrl: string; folder: string | null } | null;
	try {
		creds = await decryptZhetoWebhookUrl(c.env.DB, user.id, c.env);
	} catch {
		return jsonErr(c, "zheto secret decrypt failed", 500);
	}
	if (!creds) return jsonErr(c, "zheto not configured", 400);

	const folder = folderOverride ?? creds.folder ?? undefined;
	const payload: { url: string; note?: string; folder?: string } = { url };
	if (note) payload.note = note;
	if (folder) payload.folder = folder;

	const upstream = c.env.ZHETO_UPSTREAM ?? defaultZhetoUpstream;
	let up: { status: number; json: Record<string, unknown> };
	try {
		up = await upstream(creds.webhookUrl, payload);
	} catch {
		return c.json({ success: false, error: "upstream unreachable" }, 502);
	}

	if (up.status === 200 || up.status === 201) {
		const data =
			up.json.data && typeof up.json.data === "object"
				? (up.json.data as Record<string, unknown>)
				: up.json;
		return jsonOk(c, {
			shortUrl: typeof data.shortUrl === "string" ? data.shortUrl : null,
			slug: typeof data.slug === "string" ? data.slug : null,
			originalUrl: typeof data.originalUrl === "string" ? data.originalUrl : url,
			isExisting: up.status === 200,
		});
	}
	if (up.status >= 500) {
		return c.json({ success: false, error: "upstream error" }, 502);
	}
	return c.json({ success: false, error: "upstream rejected" }, 400);
}
