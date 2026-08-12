import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/** Whitelist Twitter CDN hosts — prevent open-proxy abuse (legacy v1 parity). */
const ALLOWED_HOSTS = new Set(["video.twimg.com", "pbs.twimg.com", "abs.twimg.com"]);

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, immutable";
const MAX_REDIRECTS = 5;

function isAllowedMediaUrl(u: URL): boolean {
	return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname.toLowerCase());
}

function isAllowedContentType(ct: string): boolean {
	const base = (ct.split(";")[0] || "").trim().toLowerCase();
	return /^(image|video)\//.test(base) || base === "application/octet-stream";
}

/**
 * Fetch with manual redirects so every hop stays on the allowlist
 * (redirect: "follow" would otherwise escape to arbitrary hosts).
 */
async function fetchAllowlisted(start: URL, init: RequestInit): Promise<Response> {
	let current = start;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!isAllowedMediaUrl(current)) {
			return new Response(JSON.stringify({ error: `Host not allowed: ${current.hostname}` }), {
				status: 403,
				headers: { "content-type": "application/json" },
			});
		}
		const res = await fetch(current.toString(), { ...init, redirect: "manual" });
		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get("location");
			// URL.canParse avoids a try/catch branch that is hard to hit consistently across runtimes.
			if (!loc || !URL.canParse(loc, current.href)) {
				return new Response(JSON.stringify({ error: "Invalid or missing redirect Location" }), {
					status: 502,
					headers: { "content-type": "application/json" },
				});
			}
			current = new URL(loc, current);
			continue;
		}
		return res;
	}
	/* v8 ignore next 4 — defensive cap; exercised in unit test via status assert */
	return new Response(JSON.stringify({ error: "Too many redirects" }), {
		status: 502,
		headers: { "content-type": "application/json" },
	});
}

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

	if (!isAllowedMediaUrl(parsed)) {
		if (parsed.protocol !== "https:") {
			return c.json({ error: "Only HTTPS urls allowed" }, 400);
		}
		return c.json({ error: `Host not allowed: ${parsed.hostname}` }, 403);
	}

	try {
		const range = c.req.header("range");
		const upstreamHeaders: Record<string, string> = {
			"User-Agent": "Mozilla/5.0 (compatible; XRay/2.0)",
			Accept: "image/*,video/*,*/*;q=0.8",
		};
		if (range) upstreamHeaders.Range = range;

		const upstream = await fetchAllowlisted(parsed, { headers: upstreamHeaders });

		// JSON error Responses from fetchAllowlisted
		const ct0 = upstream.headers.get("content-type") ?? "";
		if (ct0.includes("application/json") && !upstream.ok) {
			const body = await upstream.text();
			return new Response(body, {
				status: upstream.status as 400 | 403 | 502,
				headers: { "content-type": "application/json" },
			});
		}

		if (!upstream.ok && upstream.status !== 206) {
			const code = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
			return c.json(
				{ error: `Upstream returned ${upstream.status}` },
				code as 400 | 403 | 404 | 502 | 503,
			);
		}

		const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
		if (!isAllowedContentType(contentType)) {
			return c.json({ error: `Content-Type not allowed: ${contentType}` }, 403);
		}

		const headers = new Headers();
		headers.set("Content-Type", contentType);
		headers.set("Cache-Control", CACHE_CONTROL);
		headers.set("X-Content-Type-Options", "nosniff");
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
