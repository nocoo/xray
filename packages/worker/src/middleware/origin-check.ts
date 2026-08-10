import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Browser mutation guard: require exact Origin match (S45R-06).
 * same-site / none alone are NOT sufficient.
 */
export async function originCheck(c: Context<AppEnv>, next: Next) {
	const method = c.req.method.toUpperCase();
	if (SAFE.has(method)) return next();
	if (c.req.path.startsWith("/api/v1/ingest/")) return next();

	const hostHeader = (c.req.header("host") || "").toLowerCase();
	const host = hostHeader.split(":")[0] ?? "";
	const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");

	const origin = c.req.header("origin");
	if (!origin) {
		if (isLocal || c.env.ENVIRONMENT === "development" || c.env.ENVIRONMENT === "test") {
			return next();
		}
		return c.json({ success: false, error: "Missing Origin" }, 403);
	}

	try {
		const o = new URL(origin);
		const reqProto = (c.req.header("x-forwarded-proto") || "https").split(",")[0]?.trim();
		const expectedHost = hostHeader.includes(":") ? hostHeader : host;
		// exact host match (hostname); port ignored when behind CF
		if (o.hostname !== host) {
			// local: allow localhost ↔ 127.0.0.1 swap only
			if (
				!(
					isLocal &&
					(o.hostname === "localhost" || o.hostname === "127.0.0.1") &&
					(host === "localhost" || host === "127.0.0.1")
				)
			) {
				return c.json({ success: false, error: "Cross-origin mutation blocked" }, 403);
			}
		}
		// Prefer https in production
		if (c.env.ENVIRONMENT === "production" && o.protocol !== "https:" && reqProto === "https") {
			return c.json({ success: false, error: "Origin must be https" }, 403);
		}
		void expectedHost;
		return next();
	} catch {
		return c.json({ success: false, error: "Invalid Origin" }, 403);
	}
}
