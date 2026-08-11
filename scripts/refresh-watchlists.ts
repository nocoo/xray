#!/usr/bin/env bun
/**
 * Local producer: resolve watchlist x.com members → twitter-cli user-posts
 * → cache raw JSON → map canonical → batched ingest push.
 *
 * Docs: docs/09-local-producer-twitter-cli.md
 *
 *   bun run refresh:watchlists -- --help
 *   bun run refresh:watchlists -- --dry-run
 *   bun run refresh:watchlists -- --cache-only
 *   bun run refresh:watchlists -- --from-cache
 *   bun run refresh:watchlists --
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	assertAllowedBaseUrl,
	buildIngestBatches,
	type CanonicalItem,
	cacheFileBase,
	filterItemsByWindow,
	isValidXHandle,
	mapTwitterCliEnvelope,
	normalizeHandle,
	parsePushSuccessBody,
	pushRetryDelayMs,
	shouldStopPush,
} from "../packages/shared/src/index.ts";

type Member = { handle: string; sourceType: string };
type WatchlistGraph = { id: number; name: string; members: Member[] };
type Graph = { watchlists: WatchlistGraph[] };

const { values, positionals } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		help: { type: "boolean", default: false },
		"dry-run": { type: "boolean", default: false },
		"cache-only": { type: "boolean", default: false },
		"from-cache": { type: "boolean", default: false },
		"members-file": { type: "string" },
		"window-hours": { type: "string" },
		max: { type: "string" },
		"cache-dir": { type: "string" },
		"ingest-base": { type: "string" },
		"browser-base": { type: "string" },
		"twitter-bin": { type: "string" },
		"handle-delay-ms": { type: "string" },
	},
	allowPositionals: true,
	strict: false,
});

if (values.help || positionals.includes("help")) {
	console.log(`Usage: bun run refresh:watchlists -- [options]

Options:
  --dry-run           Resolve graph + plan only (no twitter, no push)
  --cache-only        Fetch + cache + convert; no push
  --from-cache        Reuse .cache raw JSON only (no twitter network)
  --members-file PATH Snapshot JSON (default: XRAY_MEMBERS_FILE or config/members.json)
  --window-hours N    Ingest window 1..168 (default: XRAY_WINDOW_HOURS or 24)
  --max N             twitter user-posts --max (default: 20; modest; CLI may page up to N)
  --cache-dir PATH    Raw cache root (default: XRAY_CACHE_DIR or .cache/twitter-cli)
  --ingest-base URL   Default https://xray-ingest.hexly.ai (allowlisted hosts only)
  --browser-base URL  For live graph (optional if members-file set)
  --twitter-bin PATH  Default TWITTER_BIN or twitter
  --handle-delay-ms N Sleep between twitter calls (default 3000)

Env:
  XRAY_PUSH_TOKEN          Bearer for ingest (required unless dry-run/cache-only)
  XRAY_MEMBERS_FILE        Graph snapshot
  XRAY_BROWSER_BASE        e.g. http://127.0.0.1:8787 or https://xray.hexly.ai
  XRAY_CF_AUTHORIZATION    CF Access cookie value for prod browser API
  XRAY_INGEST_BASE         Ingest host base URL
  XRAY_WINDOW_HOURS        1..168
  XRAY_TWITTER_MAX         modest upper bound (default 20)
  TWITTER_BIN              twitter-cli binary

Notes:
  Default always re-fetches twitter (overwrites cache). Use --from-cache to resume offline.
  twitter-cli may issue multiple GraphQL pages until --max; we do not add our own page loop.
`);
	process.exit(0);
}

const dryRun = Boolean(values["dry-run"]);
const cacheOnly = Boolean(values["cache-only"]);
const fromCache = Boolean(values["from-cache"]);
const windowHours = clampInt(values["window-hours"] ?? env("XRAY_WINDOW_HOURS"), 24, 1, 168);
const twitterMax = clampInt(values.max ?? env("XRAY_TWITTER_MAX"), 20, 1, 100);
const handleDelayMs = clampInt(values["handle-delay-ms"], 3000, 0, 60_000);
const cacheDir = resolve(values["cache-dir"] ?? env("XRAY_CACHE_DIR") ?? ".cache/twitter-cli");
const ingestBase = assertAllowedBaseUrl(
	values["ingest-base"] ?? env("XRAY_INGEST_BASE") ?? "https://xray-ingest.hexly.ai",
	"ingest",
);
const browserBaseRaw = values["browser-base"] ?? env("XRAY_BROWSER_BASE") ?? "";
const browserBase = browserBaseRaw
	? assertAllowedBaseUrl(browserBaseRaw.replace(/\/$/, ""), "browser")
	: "";
const twitterBin = values["twitter-bin"] ?? env("TWITTER_BIN") ?? "twitter";
const pushToken = env("XRAY_PUSH_TOKEN") ?? "";
const membersFile = values["members-file"] ?? env("XRAY_MEMBERS_FILE") ?? "config/members.json";

function env(name: string): string | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: bun/process env
	const p = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
	return p?.env?.[name];
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
	if (raw === undefined || raw === "") return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < min || n > max) {
		console.error(`invalid int ${raw} (want ${min}..${max})`);
		process.exit(2);
	}
	return n;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function loadGraph(): Promise<Graph> {
	if (existsSync(membersFile)) {
		const g = JSON.parse(readFileSync(membersFile, "utf8")) as Graph;
		if (!g?.watchlists || !Array.isArray(g.watchlists)) {
			throw new Error(`invalid members file: ${membersFile}`);
		}
		return normalizeGraph(g);
	}
	if (!browserBase) {
		throw new Error(
			`No graph source: set --members-file / XRAY_MEMBERS_FILE or XRAY_BROWSER_BASE (see docs/09)`,
		);
	}
	return fetchGraphFromBrowser(browserBase);
}

function normalizeGraph(g: Graph): Graph {
	return {
		watchlists: g.watchlists.map((w) => ({
			id: Number(w.id),
			name: String(w.name ?? w.id),
			members: (w.members ?? [])
				.filter((m) => m && (m.sourceType === "x.com" || m.sourceType === undefined))
				.map((m) => ({
					handle: normalizeHandle(String(m.handle)),
					sourceType: "x.com" as const,
				}))
				.filter((m) => isValidXHandle(m.handle)),
		})),
	};
}

function browserHeaders(): HeadersInit {
	const h: Record<string, string> = {
		accept: "application/json",
		"content-type": "application/json",
	};
	const cf = env("XRAY_CF_AUTHORIZATION");
	if (cf) h.cookie = `CF_Authorization=${cf}`;
	if (browserBase.includes("127.0.0.1") || browserBase.includes("localhost")) {
		h.host = "localhost";
		h.origin = "http://localhost:7007";
	}
	return h;
}

async function fetchGraphFromBrowser(base: string): Promise<Graph> {
	const headers = browserHeaders();
	const wlRes = await fetch(`${base}/api/watchlists`, { headers });
	if (!wlRes.ok) {
		throw new Error(`GET /api/watchlists → ${wlRes.status} ${await wlRes.text()}`);
	}
	const wlBody = (await wlRes.json()) as { data?: Array<{ id: number; name: string }> };
	const lists = wlBody.data ?? [];
	const watchlists: WatchlistGraph[] = [];
	for (const wl of lists) {
		const mRes = await fetch(`${base}/api/watchlists/${wl.id}/members`, { headers });
		if (!mRes.ok) {
			throw new Error(`GET members ${wl.id} → ${mRes.status}`);
		}
		const mBody = (await mRes.json()) as {
			data?: Array<{ handle: string; sourceType: string }>;
		};
		watchlists.push({
			id: wl.id,
			name: wl.name,
			members: (mBody.data ?? [])
				.filter((m) => m.sourceType === "x.com")
				.map((m) => ({ handle: normalizeHandle(m.handle), sourceType: "x.com" }))
				.filter((m) => isValidXHandle(m.handle)),
		});
	}
	return { watchlists };
}

function uniqueHandles(graph: Graph): Map<string, number[]> {
	const map = new Map<string, number[]>();
	for (const wl of graph.watchlists) {
		for (const m of wl.members) {
			const h = m.handle;
			if (!isValidXHandle(h)) continue;
			const arr = map.get(h) ?? [];
			if (!arr.includes(wl.id)) arr.push(wl.id);
			map.set(h, arr);
		}
	}
	return map;
}

async function ensureTwitterAuth(): Promise<void> {
	const proc = Bun.spawn([twitterBin, "status", "--json"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`twitter status failed (${code}): ${err || out}`);
	}
	let json: unknown;
	try {
		json = JSON.parse(out.includes("{") ? out.slice(out.indexOf("{")) : out);
	} catch {
		throw new Error(`twitter status non-JSON: ${out.slice(0, 200)}`);
	}
	const data = json as { ok?: boolean; data?: { authenticated?: boolean } };
	if (!data.ok || !data.data?.authenticated) {
		throw new Error("twitter-cli not authenticated — run: twitter whoami");
	}
}

function rawPathFor(handle: string): string {
	const base = cacheFileBase(handle);
	const dir = join(cacheDir, "raw");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, `${base}.json`);
	// ensure path stays under raw dir
	if (!resolve(path).startsWith(resolve(dir))) {
		throw new Error(`cache path escape: ${path}`);
	}
	return path;
}

async function fetchUserPostsOnce(
	handle: string,
): Promise<{ ok: true; data: unknown } | { ok: false; err: string; rateLimited: boolean }> {
	const proc = Bun.spawn(
		[twitterBin, "user-posts", handle, "--json", "--max", String(twitterMax)],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	const code = await proc.exited;
	const combined = `${err}\n${out}`;
	if (code !== 0) {
		const rateLimited = /429|Rate limited|rate_limited|rate.limit/i.test(combined);
		return { ok: false, err: combined.slice(0, 500), rateLimited };
	}
	const start = out.indexOf("{");
	if (start < 0) {
		return { ok: false, err: `no JSON from user-posts @${handle}`, rateLimited: false };
	}
	try {
		return { ok: true, data: JSON.parse(out.slice(start)) as unknown };
	} catch (e) {
		return {
			ok: false,
			err: e instanceof Error ? e.message : String(e),
			rateLimited: false,
		};
	}
}

async function fetchUserPosts(handle: string): Promise<unknown> {
	const rawPath = rawPathFor(handle);
	if (fromCache) {
		if (!existsSync(rawPath)) throw new Error(`cache miss: ${rawPath}`);
		return JSON.parse(readFileSync(rawPath, "utf8"));
	}

	// Default: always re-fetch. On rate-limit, do NOT hammer — skip handle (partial).
	const r = await fetchUserPostsOnce(handle);
	if (r.ok) {
		const tmp = `${rawPath}.${process.pid}.tmp`;
		writeFileSync(tmp, JSON.stringify(r.data, null, 2));
		// atomic-ish replace
		writeFileSync(rawPath, readFileSync(tmp));
		try {
			const { unlinkSync } = await import("node:fs");
			unlinkSync(tmp);
		} catch {
			/* ignore */
		}
		return r.data;
	}
	if (r.rateLimited) {
		throw new Error(`rate_limited @${handle}: ${r.err.slice(0, 200)}`);
	}
	throw new Error(`user-posts @${handle}: ${r.err}`);
}

async function pushBatch(body: {
	watchlist_id: number;
	items: CanonicalItem[];
	options?: { apply_window_hours?: number };
}): Promise<{
	ok: boolean;
	accepted?: number;
	deduped?: number;
	rejected?: number;
	error?: string;
	status: number;
	fatal?: boolean;
}> {
	const maxAttempts = 4;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let res: Response;
		try {
			res = await fetch(`${ingestBase}/api/v1/ingest/push`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${pushToken}`,
					"content-type": "application/json",
					...(ingestBase.includes("127.0.0.1") || ingestBase.includes("localhost")
						? { host: "xray-ingest.hexly.ai" }
						: {}),
				},
				body: JSON.stringify(body),
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			const delay = pushRetryDelayMs(0, attempt);
			if (delay != null && attempt < maxAttempts) {
				console.warn(`  push network error, retry in ${delay}ms: ${msg}`);
				await sleep(delay);
				continue;
			}
			return { ok: false, status: 0, error: msg };
		}

		const text = await res.text();
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			json = null;
		}

		if (shouldStopPush(res.status)) {
			return {
				ok: false,
				status: res.status,
				error:
					typeof (json as { error?: string } | null)?.error === "string"
						? (json as { error: string }).error
						: text.slice(0, 300),
				fatal: true,
			};
		}

		if (!res.ok) {
			const delay = pushRetryDelayMs(res.status, attempt);
			const errMsg =
				typeof (json as { error?: string } | null)?.error === "string"
					? (json as { error: string }).error
					: text.slice(0, 300);
			if (delay != null && attempt < maxAttempts) {
				console.warn(`  push HTTP ${res.status}, retry in ${delay}ms`);
				await sleep(delay);
				continue;
			}
			return { ok: false, status: res.status, error: errMsg };
		}

		const parsed = parsePushSuccessBody(json, body.items.length);
		if (!parsed.ok) {
			return { ok: false, status: res.status, error: parsed.reason };
		}
		return {
			ok: true,
			status: res.status,
			accepted: parsed.accepted,
			deduped: parsed.deduped,
			rejected: parsed.rejected,
		};
	}
	return { ok: false, status: 0, error: "push exhausted retries" };
}

function writeReport(report: unknown): string {
	mkdirSync(cacheDir, { recursive: true });
	const reportPath = join(cacheDir, `run-${Date.now()}.json`);
	writeFileSync(reportPath, JSON.stringify(report, null, 2));
	return reportPath;
}

async function main(): Promise<void> {
	mkdirSync(cacheDir, { recursive: true });
	const graph = await loadGraph();
	const handleMap = uniqueHandles(graph);
	const wlById = new Map(graph.watchlists.map((w) => [w.id, w]));

	console.log(
		JSON.stringify(
			{
				event: "plan",
				watchlists: graph.watchlists.length,
				uniqueHandles: handleMap.size,
				windowHours,
				twitterMax,
				dryRun,
				cacheOnly,
				fromCache,
				ingestBase,
				cacheDir,
			},
			null,
			2,
		),
	);

	if (dryRun) {
		for (const [h, wls] of handleMap) {
			console.log(`  @${h} → WL ${wls.join(",")}`);
		}
		process.exit(0);
	}

	if (!fromCache) await ensureTwitterAuth();
	if (!cacheOnly && !pushToken) {
		console.error("XRAY_PUSH_TOKEN required for push (or use --cache-only / --dry-run)");
		process.exit(2);
	}

	const itemsByHandle = new Map<string, CanonicalItem[]>();
	const handleErrors: Array<{ handle: string; error: string }> = [];
	let totalMapped = 0;
	let totalSkipped = 0;
	let totalWindowDropped = 0;

	let i = 0;
	for (const handle of handleMap.keys()) {
		i += 1;
		try {
			console.log(`[${i}/${handleMap.size}] fetch @${handle}`);
			const raw = await fetchUserPosts(handle);
			const mapped = mapTwitterCliEnvelope(raw);
			if (mapped.envelopeError) {
				handleErrors.push({ handle, error: mapped.envelopeError });
				continue;
			}
			totalMapped += mapped.items.length;
			totalSkipped += mapped.skipped.length;
			const { kept, dropped } = filterItemsByWindow(mapped.items, windowHours);
			totalWindowDropped += dropped;
			itemsByHandle.set(handle, kept);
			writeFileSync(
				join(cacheDir, "raw", `${cacheFileBase(handle)}.canonical.json`),
				JSON.stringify(kept, null, 2),
			);
			console.log(
				`  mapped=${mapped.items.length} skipped=${mapped.skipped.length} in_window=${kept.length}`,
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			handleErrors.push({ handle, error: msg });
			console.error(`  ERROR @${handle}: ${msg}`);
			// rate-limit: cool off once then continue others (no dense multi-retry)
			if (/rate_limited/i.test(msg)) {
				console.warn("  cooling 60s after rate limit…");
				await sleep(60_000);
			}
		}
		if (!fromCache && handleDelayMs > 0 && i < handleMap.size) {
			await sleep(handleDelayMs);
		}
	}

	const itemsByWl = new Map<number, Map<string, CanonicalItem>>();
	for (const [handle, items] of itemsByHandle) {
		const wls = handleMap.get(handle) ?? [];
		for (const wlId of wls) {
			let bag = itemsByWl.get(wlId);
			if (!bag) {
				bag = new Map();
				itemsByWl.set(wlId, bag);
			}
			for (const it of items) {
				if (!bag.has(it.external_id)) bag.set(it.external_id, it);
			}
		}
	}

	const summary: Array<Record<string, unknown>> = [];
	let pushErrors = 0;
	let fatalPush = false;

	const finalize = (code: number) => {
		const report = {
			event: cacheOnly ? "cache_only_done" : "refresh_done",
			windowHours,
			totalMapped,
			totalSkipped,
			totalWindowDropped,
			handleErrors,
			pushErrors,
			summary,
		};
		const reportPath = writeReport(report);
		console.log(JSON.stringify(report, null, 2));
		console.log(`report: ${reportPath}`);
		process.exit(code);
	};

	if (cacheOnly) {
		const hard =
			handleErrors.length > 0 && itemsByHandle.size === 0 ? 1 : handleErrors.length > 0 ? 1 : 0;
		finalize(hard);
		return;
	}

	try {
		for (const [wlId, bag] of itemsByWl) {
			const items = [...bag.values()];
			const batches = buildIngestBatches(wlId, items, { apply_window_hours: windowHours });
			let accepted = 0;
			let deduped = 0;
			let rejected = 0;
			const errors: string[] = [];
			if (batches.length === 0) {
				summary.push({
					watchlist_id: wlId,
					name: wlById.get(wlId)?.name,
					items: 0,
					accepted: 0,
					deduped: 0,
					rejected: 0,
				});
				continue;
			}
			for (const batch of batches) {
				const res = await pushBatch(batch);
				if (!res.ok) {
					pushErrors += 1;
					errors.push(`HTTP ${res.status}: ${res.error}`);
					console.error(`push WL ${wlId} failed: ${res.error}`);
					if (res.fatal) {
						fatalPush = true;
						break;
					}
					continue;
				}
				accepted += res.accepted ?? 0;
				deduped += res.deduped ?? 0;
				rejected += res.rejected ?? 0;
			}
			summary.push({
				watchlist_id: wlId,
				name: wlById.get(wlId)?.name,
				items: items.length,
				batches: batches.length,
				accepted,
				deduped,
				rejected,
				errors: errors.length ? errors : undefined,
			});
			console.log(
				`WL ${wlId} ${wlById.get(wlId)?.name}: items=${items.length} accepted=${accepted} deduped=${deduped} rejected=${rejected}`,
			);
			if (fatalPush) break;
		}
	} finally {
		/* report always written via finalize */
	}

	const incomplete =
		handleErrors.length > 0 ||
		pushErrors > 0 ||
		fatalPush ||
		(itemsByHandle.size === 0 && handleMap.size > 0);
	finalize(incomplete ? 1 : 0);
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	try {
		writeReport({ event: "fatal", error: String(e) });
	} catch {
		/* ignore */
	}
	process.exit(1);
});
