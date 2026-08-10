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
	const body = (await c.req.json().catch(() => null)) as {
		ingest?: { windowHours?: number };
	} | null;
	if (!body?.ingest?.windowHours) return jsonErr(c, "ingest.windowHours required", 400);
	const n = Math.floor(Number(body.ingest.windowHours));
	if (!Number.isFinite(n) || n < 1 || n > 168) {
		return jsonErr(c, "windowHours must be 1–168", 400);
	}
	await setSetting(c.env.DB, user.id, "ingest.windowHours", String(n));
	return jsonOk(c, { ingest: { windowHours: n } });
}
