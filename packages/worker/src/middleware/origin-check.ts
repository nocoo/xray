import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Browser-only same-origin guard for mutating /api/* (S45-10).
 * Skips ingest host (Bearer push) and safe methods.
 */
export async function originCheck(c: Context<AppEnv>, next: Next) {
	const method = c.req.method.toUpperCase();
	if (SAFE.has(method)) return next();

	const host = (c.req.header("host") || "").toLowerCase();
	const isLocal =
		host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.includes(".localhost");
	// Ingest push uses Bearer; host guard already scopes path.
	if (c.req.path.startsWith("/api/v1/ingest/")) return next();

	const site = c.req.header("sec-fetch-site");
	if (site === "same-origin" || site === "none" || site === "same-site") {
		return next();
	}

	const origin = c.req.header("origin");
	if (!origin) {
		// Non-browser clients (curl) without Origin: allow only local/dev
		if (isLocal || c.env.ENVIRONMENT === "development" || c.env.ENVIRONMENT === "test") {
			return next();
		}
		return c.json({ success: false, error: "Missing Origin" }, 403);
	}

	try {
		const o = new URL(origin);
		const h = host.split(":")[0] ?? "";
		if (
			o.hostname === h ||
			(isLocal && (o.hostname === "localhost" || o.hostname === "127.0.0.1"))
		) {
			return next();
		}
	} catch {
		return c.json({ success: false, error: "Invalid Origin" }, 403);
	}
	return c.json({ success: false, error: "Cross-origin mutation blocked" }, 403);
}
