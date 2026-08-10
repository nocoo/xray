import type { Context } from "hono";
import { jsonErr, jsonOk, requireUser } from "../lib/http.js";
import { getWindowHours, setSetting } from "../repos/settings.js";
import type { AppEnv } from "../types.js";

export async function getSettingsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const windowHours = await getWindowHours(c.env.DB, user.id);
	return jsonOk(c, {
		email: user.email,
		name: user.name,
		image: user.image,
		ingest: { windowHours },
	});
}

export async function patchSettingsRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const raw = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return jsonErr(c, "invalid body", 400);
	}
	const body = raw as { ingest?: unknown };
	if (!body.ingest || typeof body.ingest !== "object" || Array.isArray(body.ingest)) {
		return jsonErr(c, "ingest.windowHours required", 400);
	}
	const wh = (body.ingest as { windowHours?: unknown }).windowHours;
	if (typeof wh !== "number" || !Number.isInteger(wh) || wh < 1 || wh > 168) {
		return jsonErr(c, "windowHours must be 1–168", 400);
	}
	const n = wh;
	await setSetting(c.env.DB, user.id, "ingest.windowHours", String(n));
	return jsonOk(c, { ingest: { windowHours: n } });
}
