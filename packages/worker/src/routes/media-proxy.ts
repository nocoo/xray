import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/** Whitelist Twitter CDN hosts — prevent open-proxy abuse (legacy v1 parity). */
const ALLOWED_HOSTS = new Set(["video.twimg.com", "pbs.twimg.com", "abs.twimg.com"]);

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, immutable";

export async function mediaProxyRoute(c: Context<AppEnv>): Promise<Response> {
	const url = c.req.query("url");
	if (!url) {
		return c.json({ error: "Missing url parameter" }, 400);
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return c.json({ error: "Invalid url" }, 400);
	}

	if (parsed.protocol !== "https:") {
		return c.json({ error: "Only HTTPS urls allowed" }, 400);
	}
	if (!ALLOWED_HOSTS.has(parsed.hostname)) {
		return c.json({ error: `Host not allowed: ${parsed.hostname}` }, 403);
	}

	try {
		const range = c.req.header("range");
		const upstreamHeaders: Record<string, string> = {
			"User-Agent": "Mozilla/5.0 (compatible; XRay/2.0)",
			Accept: "*/*",
		};
		if (range) upstreamHeaders.Range = range;

		const upstream = await fetch(parsed.toString(), {
			headers: upstreamHeaders,
			redirect: "follow",
		});

		if (!upstream.ok && upstream.status !== 206) {
			const code = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
			return c.json(
				{ error: `Upstream returned ${upstream.status}` },
				code as 400 | 403 | 404 | 502 | 503,
			);
		}

		const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
		const headers = new Headers();
		headers.set("Content-Type", contentType);
		headers.set("Cache-Control", CACHE_CONTROL);
		headers.set("Access-Control-Allow-Origin", "*");
		const contentLength = upstream.headers.get("content-length");
		if (contentLength) headers.set("Content-Length", contentLength);
		const contentRange = upstream.headers.get("content-range");
		if (contentRange) headers.set("Content-Range", contentRange);
		const acceptRanges = upstream.headers.get("accept-ranges");
		if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

		return new Response(upstream.body, {
			status: upstream.status,
			headers,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ error: `Proxy fetch failed: ${message}` }, 502);
	}
}
