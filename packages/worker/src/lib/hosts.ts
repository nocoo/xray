/** Locked dual-host topology (docs/02 XR-01, R6-01). */
export const BROWSER_HOSTS = new Set([
	"xray.hexly.ai",
	"xray-staging.hexly.ai",
	"xray.dev.hexly.ai",
	"localhost",
	"127.0.0.1",
]);

export const INGEST_HOSTS = new Set(["xray-ingest.hexly.ai", "xray-ingest-staging.hexly.ai"]);

export type HostKind = "browser" | "ingest" | "local" | "unknown";

export function normalizeHost(hostHeader: string): string {
	return (hostHeader.split(":")[0] ?? "").toLowerCase();
}

export function classifyHost(hostHeader: string): HostKind {
	const h = normalizeHost(hostHeader);
	if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) {
		return "local";
	}
	if (INGEST_HOSTS.has(h)) return "ingest";
	if (BROWSER_HOSTS.has(h)) return "browser";
	// Local Caddy may forward Host: xray.dev.hexly.ai already in set
	return "unknown";
}

/** Paths allowed on ingest hosts (push lands in S5). */
export function isIngestAllowedPath(method: string, path: string): boolean {
	if (method === "GET" && path === "/api/live") return true;
	if (method === "GET" && path === "/api/v1/ingest/graph") return true;
	if (method === "POST" && path === "/api/v1/ingest/push") return true;
	return false;
}
