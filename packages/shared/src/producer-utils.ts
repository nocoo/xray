/** Pure helpers for refresh-watchlists producer (testable without I/O). */

export const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

const ALLOWED_INGEST_HOSTS = new Set([
	"xray-ingest.hexly.ai",
	"xray-ingest-staging.hexly.ai",
	"127.0.0.1",
	"localhost",
]);

const ALLOWED_BROWSER_HOSTS = new Set([
	"xray.hexly.ai",
	"xray-staging.hexly.ai",
	"xray.dev.hexly.ai",
	"127.0.0.1",
	"localhost",
]);

/** Env keys allowed into twitter-cli child (whitelist — no ambient secrets). */
export const TWITTER_CHILD_ENV_ALLOW = new Set([
	"PATH",
	"HOME",
	"USER",
	"LOGNAME",
	"SHELL",
	"TMPDIR",
	"TEMP",
	"TMP",
	"TERM",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LC_MESSAGES",
	"TZ",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"ALL_PROXY",
	"all_proxy",
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"REQUESTS_CA_BUNDLE",
	"CURL_CA_BUNDLE",
	"OUTPUT",
	"TWITTER_AUTH_TOKEN",
	"TWITTER_CT0",
	"TWITTER_BROWSER",
	"TWITTER_CHROME_PROFILE",
	"TWITTER_PROXY",
	"TWITTER_COOKIE",
]);

/** @deprecated secrets are excluded by whitelist; kept for export stability */
export const XRAY_SECRET_ENV_KEYS = ["XRAY_PUSH_TOKEN", "XRAY_CF_AUTHORIZATION"] as const;

export function scrubEnvForTwitter(
	env: Record<string, string | undefined>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) {
		if (v === undefined) continue;
		if (TWITTER_CHILD_ENV_ALLOW.has(k) || k.startsWith("LC_")) {
			out[k] = v;
		}
	}
	return out;
}

export type MembersGraph = {
	watchlists: Array<{
		id: number;
		name: string;
		members: Array<{ handle: string; sourceType: "x.com" }>;
	}>;
};

/** Strict parse of members snapshot / browser graph. Throws on invalid rows. */
export function parseMembersGraph(raw: unknown): MembersGraph {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("graph must be object");
	}
	const watchlists = (raw as { watchlists?: unknown }).watchlists;
	if (!Array.isArray(watchlists)) {
		throw new Error("graph.watchlists must be an array");
	}
	const out: MembersGraph["watchlists"] = [];
	for (const w of watchlists) {
		if (!w || typeof w !== "object" || Array.isArray(w)) {
			throw new Error("watchlist entry invalid");
		}
		const wr = w as Record<string, unknown>;
		const id = wr.id;
		if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
			throw new Error(`watchlist id invalid: ${String(id)}`);
		}
		if (typeof wr.name !== "string" || !wr.name.trim()) {
			throw new Error(`watchlist ${id} name required`);
		}
		if (!Array.isArray(wr.members)) {
			throw new Error(`watchlist ${id} members must be array`);
		}
		const members: Array<{ handle: string; sourceType: "x.com" }> = [];
		for (const m of wr.members) {
			if (!m || typeof m !== "object" || Array.isArray(m)) {
				throw new Error(`watchlist ${id} member invalid`);
			}
			const mr = m as Record<string, unknown>;
			if (mr.sourceType !== "x.com") {
				throw new Error(`watchlist ${id} member sourceType must be x.com`);
			}
			if (typeof mr.handle !== "string" || !mr.handle.trim()) {
				throw new Error(`watchlist ${id} member handle required`);
			}
			const handle = mr.handle.trim().replace(/^@/, "").toLowerCase();
			if (!isValidXHandle(handle)) {
				throw new Error(`watchlist ${id} invalid handle: ${mr.handle}`);
			}
			members.push({ handle, sourceType: "x.com" });
		}
		out.push({ id, name: wr.name.trim(), members });
	}
	return { watchlists: out };
}

export function exitCodeForRefresh(stats: {
	handleErrors: number;
	pushErrors: number;
	totalRejected: number;
	handlesPlanned: number;
	handlesOk: number;
	fatalPush: boolean;
}): number {
	if (stats.fatalPush) return 1;
	if (stats.handleErrors > 0) return 1;
	if (stats.pushErrors > 0) return 1;
	if (stats.totalRejected > 0) return 1;
	if (stats.handlesPlanned > 0 && stats.handlesOk === 0) return 1;
	return 0;
}
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
