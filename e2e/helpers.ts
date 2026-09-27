export function env(name: string): string | undefined {
	return process.env[name];
}

function localUrl(name: string): string {
	const value = env(name);
	if (env("XRAY_E2E_MANAGED") !== "1" || !value) throw new Error("Use bun run test:l3 for an owned local E2E stack");
	const url = new URL(value);
	if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || ["7007", "37007"].includes(url.port)) throw new Error("E2E requires an isolated local URL");
	return url.origin;
}

export const BROWSER = localUrl("PLAYWRIGHT_BROWSER_URL");
export const WORKER = localUrl("PLAYWRIGHT_WORKER_URL");
export const INGEST = localUrl("PLAYWRIGHT_INGEST_URL");
const jwt = env("XRAY_TEST_JWT_A");
if (!jwt) throw new Error("E2E fixture identity is missing");
export const browserApiHeaders = {
	host: "localhost", origin: BROWSER, "content-type": "application/json", "Cf-Access-Jwt-Assertion": jwt,
};

export async function requireWorker(request: {
	get: (url: string, opts?: { headers?: Record<string, string> }) => Promise<{ ok: () => boolean }>;
}): Promise<void> {
	const response = await request.get(`${WORKER}/api/me`, { headers: browserApiHeaders });
	if (!response.ok()) throw new Error("Managed E2E Worker failed authenticated readiness");
}
