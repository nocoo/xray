/** Pure helpers for refresh-watchlists producer (testable without I/O). */

export const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

const ALLOWED_INGEST_HOSTS = new Set(["xray-ingest.hexly.ai", "127.0.0.1", "localhost"]);

const ALLOWED_BROWSER_HOSTS = new Set([
	"xray.hexly.ai",
	"xray.dev.hexly.ai",
	"127.0.0.1",
	"localhost",
]);

export function isValidXHandle(handle: string): boolean {
	return X_HANDLE_RE.test(handle);
}

/** Safe cache file basename for a validated handle. */
export function cacheFileBase(handle: string): string {
	if (!isValidXHandle(handle)) {
		throw new Error(`invalid x.com handle for cache path: ${handle}`);
	}
	return handle.toLowerCase();
}

/**
 * Strict base URL allowlist for dual-host + local dev.
 * Rejects userinfo, query, fragment, non-root path, and non-allowlisted hosts.
 * Production ingest is HTTPS only; loopback may be HTTP.
 */
export function assertAllowedBaseUrl(raw: string, kind: "ingest" | "browser"): string {
	const trimmed = raw.trim().replace(/\/$/, "");
	let u: URL;
	try {
		u = new URL(trimmed);
	} catch {
		throw new Error(`invalid ${kind} base URL: ${raw}`);
	}
	if (u.username || u.password) {
		throw new Error(`${kind} base URL must not include credentials`);
	}
	if (u.search || u.hash) {
		throw new Error(`${kind} base URL must not include query/fragment`);
	}
	if (u.pathname && u.pathname !== "/" && u.pathname !== "") {
		throw new Error(`${kind} base URL must be origin only (no path)`);
	}
	const host = u.hostname.toLowerCase();
	const allow = kind === "ingest" ? ALLOWED_INGEST_HOSTS : ALLOWED_BROWSER_HOSTS;
	if (!allow.has(host)) {
		throw new Error(`${kind} host not allowlisted: ${host} (allowed: ${[...allow].join(", ")})`);
	}
	const loopback = host === "127.0.0.1" || host === "localhost";
	if (loopback) {
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			throw new Error(`${kind} loopback must be http(s)`);
		}
	} else if (u.protocol !== "https:") {
		throw new Error(`${kind} production host requires https`);
	}
	return `${u.protocol}//${u.host}`;
}

export type PushResponse = {
	ok: true;
	accepted: number;
	deduped: number;
	rejected: number;
	errors?: unknown;
};

export type PushParseFail = { ok: false; reason: string };

/** Validate ingest push JSON body after HTTP 2xx. */
export function parsePushSuccessBody(
	json: unknown,
	batchSize: number,
): PushResponse | PushParseFail {
	if (!json || typeof json !== "object" || Array.isArray(json)) {
		return { ok: false, reason: "push body not object" };
	}
	const o = json as Record<string, unknown>;
	if (o.ok !== true) {
		return { ok: false, reason: "push body ok !== true" };
	}
	const accepted = o.accepted;
	const deduped = o.deduped;
	const rejected = o.rejected;
	if (
		typeof accepted !== "number" ||
		typeof deduped !== "number" ||
		typeof rejected !== "number" ||
		!Number.isInteger(accepted) ||
		!Number.isInteger(deduped) ||
		!Number.isInteger(rejected) ||
		accepted < 0 ||
		deduped < 0 ||
		rejected < 0
	) {
		return { ok: false, reason: "push counts invalid" };
	}
	if (accepted + deduped + rejected !== batchSize) {
		return {
			ok: false,
			reason: `push counts sum ${accepted + deduped + rejected} !== batch ${batchSize}`,
		};
	}
	return { ok: true, accepted, deduped, rejected, errors: o.errors };
}

export function shouldStopPush(status: number): boolean {
	return status === 401 || status === 403;
}

export function pushRetryDelayMs(status: number, attempt: number): number | null {
	// attempt 1..n after failure
	if (status === 429) {
		return Math.min(60_000 * attempt, 180_000);
	}
	if (status >= 500 || status === 0) {
		return Math.min(2_000 * 2 ** (attempt - 1), 30_000);
	}
	return null;
}
