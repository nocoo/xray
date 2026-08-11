import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** Production Host → allowed Origin (exact 1:1). */
const PROD_ORIGIN_BY_HOST: Record<string, string> = {
	"xray.hexly.ai": "https://xray.hexly.ai",
	"xray-staging.hexly.ai": "https://xray-staging.hexly.ai",
};

/** Local Caddy browser host (docs/02 XR-01). */
const DEV_BROWSER_ORIGINS = new Set([
	"https://xray.dev.hexly.ai",
	"http://xray.dev.hexly.ai",
	"http://localhost:7007",
	"http://127.0.0.1:7007",
]);

/**
 * Browser mutation guard: require exact Origin match (S45R-06 / S45RRR-04).
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
			const expected = PROD_ORIGIN_BY_HOST[host];
			if (!expected || origin !== expected) {
				return c.json({ success: false, error: "Cross-origin mutation blocked" }, 403);
			}
			return next();
		}

		// Dev: allow Caddy host + localhost UI even if proxy rewrites Host.
		if (
			!isProd &&
			(DEV_BROWSER_ORIGINS.has(origin) ||
				o.hostname === "xray.dev.hexly.ai" ||
				o.hostname === "localhost" ||
				o.hostname === "127.0.0.1")
		) {
			return next();
		}

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
