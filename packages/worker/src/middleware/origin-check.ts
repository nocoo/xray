import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Browser mutation guard: require exact Origin match (S45R-06 / S45RR-06).
 * Production: scheme + hostname + port must match the browser host URL.
 */
export async function originCheck(c: Context<AppEnv>, next: Next) {
	const method = c.req.method.toUpperCase();
	if (SAFE.has(method)) return next();
	if (c.req.path.startsWith("/api/v1/ingest/")) return next();

	const hostHeader = (c.req.header("host") || "").toLowerCase();
	const host = hostHeader.split(":")[0] ?? "";
	const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
	const isProd = c.env.ENVIRONMENT === "production";

	const origin = c.req.header("origin");
	if (!origin) {
		if (isLocal || c.env.ENVIRONMENT === "development" || c.env.ENVIRONMENT === "test") {
			return next();
		}
		return c.json({ success: false, error: "Missing Origin" }, 403);
	}

	try {
		const o = new URL(origin);
		if (isProd) {
			// Locked production browser origins (exact).
			const allowed = new Set(["https://xray.hexly.ai", "https://xray-staging.hexly.ai"]);
			if (!allowed.has(origin)) {
				return c.json({ success: false, error: "Cross-origin mutation blocked" }, 403);
			}
			return next();
		}

		// Non-prod: hostname match + local swap; optional port from Host header
		if (o.hostname !== host) {
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
		if (hostHeader.includes(":")) {
			const hostPort = hostHeader.split(":")[1];
			const originPort = o.port || (o.protocol === "https:" ? "443" : "80");
			if (hostPort && originPort !== hostPort) {
				return c.json({ success: false, error: "Cross-origin mutation blocked" }, 403);
			}
		}
		return next();
	} catch {
		return c.json({ success: false, error: "Invalid Origin" }, 403);
	}
}
