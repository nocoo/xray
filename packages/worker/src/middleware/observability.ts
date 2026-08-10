import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

/** Request id + structured timing log (S45R-13). */
export async function observability(c: Context<AppEnv>, next: Next) {
	const requestId = c.req.header("x-request-id") || crypto.randomUUID();
	c.header("x-request-id", requestId);
	const start = Date.now();
	try {
		await next();
	} finally {
		const durationMs = Date.now() - start;
		const path = c.req.path;
		const status = c.res.status;
		// redact tokens from path/query never logged; path only
		console.log(
			JSON.stringify({
				level: "info",
				event: "http_request",
				request_id: requestId,
				method: c.req.method,
				path,
				status,
				duration_ms: durationMs,
			}),
		);
	}
}
