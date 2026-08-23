import { test } from "@playwright/test";

/** Shared L3 env — isolated local ports (docs/02). */
export function env(name: string): string | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: process may be absent in some runners
	const p = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
	return p?.env?.[name];
}

export const BROWSER =
	env("PLAYWRIGHT_BROWSER_URL") || env("PLAYWRIGHT_BASE_URL") || "http://127.0.0.1:7007";
export const WORKER = env("PLAYWRIGHT_WORKER_URL") || "http://127.0.0.1:37007";
export const INGEST = env("PLAYWRIGHT_INGEST_URL") || WORKER;

export const browserApiHeaders = {
	host: "localhost",
	origin: "http://localhost:7007",
	"content-type": "application/json",
};

/**
 * Require local worker. In CI: hard-fail if unreachable (no silent all-skip green).
 * Locally: skip so `bun run test:l3` is safe without servers.
 */
export async function requireWorker(request: {
	get: (url: string, opts?: { headers?: Record<string, string> }) => Promise<{ ok: () => boolean }>;
}): Promise<void> {
	const ci = !!env("CI");
	try {
		const live = await request.get(`${WORKER}/api/live`, { headers: { host: "localhost" } });
		if (!live.ok()) {
			if (ci) throw new Error(`L3 CI requires worker at ${WORKER}/api/live (got non-OK)`);
			test.skip(true, "worker not reachable — start bun run dev");
		}
	} catch (e) {
		if (ci) {
			throw e instanceof Error
				? e
				: new Error(`L3 CI requires worker at ${WORKER}/api/live`);
		}
		test.skip(true, "worker not reachable — start bun run dev");
	}
}
