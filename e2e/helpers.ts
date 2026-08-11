import { test } from "@playwright/test";

/** Shared L3 env — isolated local ports (docs/02). */
export function env(name: string): string | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: process may be absent in some runners
	const p = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
	return p?.env?.[name];
}

export const BROWSER =
	env("PLAYWRIGHT_BROWSER_URL") || env("PLAYWRIGHT_BASE_URL") || "http://127.0.0.1:7007";
export const WORKER = env("PLAYWRIGHT_WORKER_URL") || "http://127.0.0.1:8787";
export const INGEST = env("PLAYWRIGHT_INGEST_URL") || WORKER;

export const browserApiHeaders = {
	host: "localhost",
	origin: "http://localhost:7007",
	"content-type": "application/json",
};

/** Skip the test when local worker is down (L3 is on-demand, not pre-push). */
export async function requireWorker(
	request: { get: (url: string, opts?: { headers?: Record<string, string> }) => Promise<{ ok: () => boolean }> },
): Promise<void> {
	try {
		const live = await request.get(`${WORKER}/api/live`, { headers: { host: "localhost" } });
		test.skip(!live.ok(), "worker not reachable — start bun run dev");
	} catch {
		test.skip(true, "worker not reachable — start bun run dev");
	}
}
