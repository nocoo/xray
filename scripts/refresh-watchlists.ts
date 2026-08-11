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
	buildIngestBatches,
	type CanonicalItem,
	filterItemsByWindow,
	mapTwitterCliEnvelope,
	normalizeHandle,
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
  --from-cache        Reuse .cache raw JSON; convert + push
  --members-file PATH Snapshot JSON (default: XRAY_MEMBERS_FILE or config/members.json)
  --window-hours N    Ingest window 1..168 (default: XRAY_WINDOW_HOURS or 24)
  --max N             twitter user-posts --max (default: XRAY_TWITTER_MAX or 20)
  --cache-dir PATH    Raw cache root (default: XRAY_CACHE_DIR or .cache/twitter-cli)
  --ingest-base URL   Default https://xray-ingest.hexly.ai
  --browser-base URL  For live graph (optional if members-file set)
  --twitter-bin PATH  Default TWITTER_BIN or twitter
  --handle-delay-ms N Sleep between twitter calls (default 1500)

Env:
  XRAY_PUSH_TOKEN          Bearer for ingest (required unless dry-run/cache-only)
  XRAY_MEMBERS_FILE        Graph snapshot
  XRAY_BROWSER_BASE        e.g. http://127.0.0.1:8787 or https://xray.hexly.ai
  XRAY_CF_AUTHORIZATION    CF Access cookie value for prod browser API
  XRAY_INGEST_BASE         Ingest host base URL
  XRAY_WINDOW_HOURS        1..168
  XRAY_TWITTER_MAX         modest natural page size
  TWITTER_BIN              twitter-cli binary
`);
	process.exit(0);
}

const dryRun = Boolean(values["dry-run"]);
const cacheOnly = Boolean(values["cache-only"]);
const fromCache = Boolean(values["from-cache"]);
const windowHours = clampInt(values["window-hours"] ?? process.env.XRAY_WINDOW_HOURS, 24, 1, 168);
const twitterMax = clampInt(values.max ?? process.env.XRAY_TWITTER_MAX, 20, 1, 100);
const handleDelayMs = clampInt(values["handle-delay-ms"], 1500, 0, 60_000);
const cacheDir = resolve(values["cache-dir"] ?? process.env.XRAY_CACHE_DIR ?? ".cache/twitter-cli");
const ingestBase = (
	values["ingest-base"] ??
	process.env.XRAY_INGEST_BASE ??
	"https://xray-ingest.hexly.ai"
).replace(/\/$/, "");
const browserBase = (values["browser-base"] ?? process.env.XRAY_BROWSER_BASE ?? "").replace(
	/\/$/,
	"",
);
const twitterBin = values["twitter-bin"] ?? process.env.TWITTER_BIN ?? "twitter";
const pushToken = process.env.XRAY_PUSH_TOKEN ?? "";
const membersFile =
	values["members-file"] ?? process.env.XRAY_MEMBERS_FILE ?? "config/members.json";

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
					sourceType: "x.com",
				}))
				.filter((m) => m.handle.length > 0),
		})),
	};
}

function browserHeaders(): HeadersInit {
	const h: Record<string, string> = {
		accept: "application/json",
		"content-type": "application/json",
	};
	const cf = process.env.XRAY_CF_AUTHORIZATION;
	if (cf) h.cookie = `CF_Authorization=${cf}`;
	// local AUTH_DEV_BYPASS
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
				.map((m) => ({ handle: normalizeHandle(m.handle), sourceType: "x.com" })),
		});
	}
	return { watchlists };
}

function uniqueHandles(graph: Graph): Map<string, number[]> {
	/** handle → watchlist ids */
	const map = new Map<string, number[]>();
	for (const wl of graph.watchlists) {
		for (const m of wl.members) {
			const h = m.handle;
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
		json = JSON.parse(out);
	} catch {
		throw new Error(`twitter status non-JSON: ${out.slice(0, 200)}`);
	}
	const data = json as { ok?: boolean; data?: { authenticated?: boolean } };
	if (!data.ok || !data.data?.authenticated) {
		throw new Error("twitter-cli not authenticated — run: twitter whoami");
	}
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
		const rateLimited = /429|Rate limited|rate.limit/i.test(combined);
		return { ok: false, err: combined.slice(0, 500), rateLimited };
	}
	const start = out.indexOf("{");
	if (start < 0)
		return { ok: false, err: `no JSON from user-posts @${handle}`, rateLimited: false };
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
	const rawPath = join(cacheDir, "raw", `${handle}.json`);
	mkdirSync(join(cacheDir, "raw"), { recursive: true });
	if (fromCache) {
		if (!existsSync(rawPath)) throw new Error(`cache miss: ${rawPath}`);
		return JSON.parse(readFileSync(rawPath, "utf8"));
	}
	// Prefer existing cache (resume after partial rate-limit runs)
	if (existsSync(rawPath) && process.env.XRAY_REFRESH_FORCE !== "1") {
		return JSON.parse(readFileSync(rawPath, "utf8"));
	}

	const maxAttempts = 4;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const r = await fetchUserPostsOnce(handle);
		if (r.ok) {
			writeFileSync(rawPath, JSON.stringify(r.data, null, 2));
			return r.data;
		}
		if (r.rateLimited && attempt < maxAttempts) {
			const wait = 45_000 * attempt;
			console.warn(
				`  rate-limited @${handle}, sleep ${wait / 1000}s (attempt ${attempt}/${maxAttempts})`,
			);
			await sleep(wait);
			continue;
		}
		throw new Error(`user-posts @${handle}: ${r.err}`);
	}
	throw new Error(`user-posts @${handle}: exhausted retries`);
}
async function pushBatch(body: unknown): Promise<{
	ok: boolean;
	accepted?: number;
	deduped?: number;
	rejected?: number;
	error?: string;
	status: number;
}> {
	const res = await fetch(`${ingestBase}/api/v1/ingest/push`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${pushToken}`,
			"content-type": "application/json",
			// Host header for dual-host local tests; browsers ignore on prod HTTPS
			...(ingestBase.includes("127.0.0.1") || ingestBase.includes("localhost")
				? { host: "xray-ingest.hexly.ai" }
				: {}),
		},
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let json: Record<string, unknown> = {};
	try {
		json = JSON.parse(text) as Record<string, unknown>;
	} catch {
		/* raw */
	}
	if (!res.ok) {
		return {
			ok: false,
			status: res.status,
			error: typeof json.error === "string" ? json.error : text.slice(0, 300),
		};
	}
	return {
		ok: true,
		status: res.status,
		accepted: Number(json.accepted ?? 0),
		deduped: Number(json.deduped ?? 0),
		rejected: Number(json.rejected ?? 0),
	};
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

	/** handle → in-window canonical items */
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
				join(cacheDir, "raw", `${handle}.canonical.json`),
				JSON.stringify(kept, null, 2),
			);
			console.log(
				`  mapped=${mapped.items.length} skipped=${mapped.skipped.length} in_window=${kept.length}`,
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			handleErrors.push({ handle, error: msg });
			console.error(`  ERROR @${handle}: ${msg}`);
		}
		if (!fromCache && handleDelayMs > 0 && i < handleMap.size) {
			await sleep(handleDelayMs);
		}
	}

	/** watchlist_id → items (dedupe by external_id) */
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

	if (cacheOnly) {
		console.log(
			JSON.stringify(
				{
					event: "cache_only_done",
					totalMapped,
					totalSkipped,
					totalWindowDropped,
					handleErrors,
					perWatchlist: [...itemsByWl.entries()].map(([id, bag]) => ({
						watchlist_id: id,
						name: wlById.get(id)?.name,
						items: bag.size,
					})),
				},
				null,
				2,
			),
		);
		process.exit(handleErrors.length && itemsByHandle.size === 0 ? 1 : 0);
	}

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
	}

	const report = {
		event: "refresh_done",
		windowHours,
		totalMapped,
		totalSkipped,
		totalWindowDropped,
		handleErrors,
		pushErrors,
		summary,
	};
	const reportPath = join(cacheDir, `run-${Date.now()}.json`);
	writeFileSync(reportPath, JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
	console.log(`report: ${reportPath}`);

	const hardFail =
		(handleErrors.length > 0 && itemsByHandle.size === 0) ||
		(pushErrors > 0 && summary.every((s) => !s.accepted && !s.deduped));
	process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
