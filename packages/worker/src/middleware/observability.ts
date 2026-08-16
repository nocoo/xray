import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestIdFrom(header: string | undefined): string {
	if (header && UUID_RE.test(header.trim())) return header.trim();
	return crypto.randomUUID();
}

/** Simple non-crypto fingerprint for logs (not security). */
function shortHash(s: string): string {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	return (h >>> 0).toString(16).padStart(8, "0");
}

/** Request id + structured timing log (S45R-13 / S45RR-09). */
export async function observability(c: Context<AppEnv>, next: Next) {
	const requestId = requestIdFrom(c.req.header("x-request-id"));
	c.header("x-request-id", requestId);
	const start = Date.now();
	let errorCode: string | undefined;
	try {
		await next();
	} catch (e) {
		errorCode = e instanceof Error ? e.name : "Error";
		throw e;
	} finally {
		const durationMs = Date.now() - start;
		const path = c.req.path;
		const status = c.res.status;
		const user = c.get("authUser");
		console.log(
			JSON.stringify({
				level: status >= 500 ? "error" : "info",
				event: "http_request",
				request_id: requestId,
				method: c.req.method,
				path,
				status,
				duration_ms: durationMs,
				user_hash: user?.id ? shortHash(user.id) : undefined,
				error_code: errorCode,
				ingest: path.startsWith("/api/v1/ingest/")
					? { route: path.includes("/graph") ? "graph" : "push" }
					: undefined,
			}),
		);
	}
}
