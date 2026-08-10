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
