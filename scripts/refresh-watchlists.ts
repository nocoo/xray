#!/usr/bin/env bun
/**
 * Local producer orchestrator — source-agnostic after XTimelineSource boundary.
 * Default adapter: twitter-cli (createTwitterCliSource). Swap adapter to replace vendor.
 *
 * Docs: docs/09-local-producer-twitter-cli.md § boundary
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	assertAllowedBaseUrl,
	atomicWriteJson,
	buildIngestBatches,
	type CanonicalItem,
	cacheFileBase,
	createTwitterCliSource,
	exitCodeForRefresh,
	filterItemsByWindow,
	isValidXHandle,
	parseMembersGraph,
	pushIngestBatch,
	type XTimelineSource,
} from "../packages/shared/src/index.ts";

type Graph = ReturnType<typeof parseMembersGraph>;

let values: ReturnType<typeof parseArgs>["values"];
let positionals: string[];
try {
	const parsed = parseArgs({
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
		strict: true,
	});
	values = parsed.values;
	positionals = parsed.positionals;
} catch (e) {
	console.error(e instanceof Error ? e.message : e);
	console.error("Use --help for options");
	process.exit(2);
}
if (positionals.length && !positionals.every((p) => p === "help")) {
	console.error(`unexpected arguments: ${positionals.join(" ")}`);
	process.exit(2);
}

if (values.help || positionals.includes("help")) {
	console.log(`Usage: bun run refresh:watchlists -- [options]

Options:
  --dry-run           Resolve graph + plan only (no twitter, no push)
  --cache-only        Fetch + cache + convert; no push
  --from-cache        Reuse .cache raw JSON only (no twitter network)
  --members-file PATH Snapshot JSON (default: XRAY_MEMBERS_FILE or config/members.json)
  --window-hours N    Ingest window 1..168 (default: XRAY_WINDOW_HOURS or 24)
  --max N             twitter user-posts --max (default: 20; CLI may page up to N)
  --cache-dir PATH    Raw cache root (default: XRAY_CACHE_DIR or .cache/twitter-cli)
  --ingest-base URL   Default https://xray-ingest.hexly.ai (allowlisted)
  --browser-base URL  Live graph (optional if members-file set)
  --twitter-bin PATH  Default TWITTER_BIN or twitter
  --handle-delay-ms N Sleep between twitter calls (default 3000)

Env: XRAY_PUSH_TOKEN, XRAY_MEMBERS_FILE, XRAY_BROWSER_BASE, XRAY_CF_AUTHORIZATION,
     XRAY_INGEST_BASE, XRAY_WINDOW_HOURS, XRAY_TWITTER_MAX, TWITTER_BIN

Notes:
  Default always re-fetches twitter. Use --from-cache offline.
  twitter-cli may page until --max; we do not add our own cursor loop.

Preflight (when not --from-cache / --dry-run):
  Requires twitter-cli on PATH (or TWITTER_BIN) and a valid login.
  Missing binary / expired cookies print install & re-login steps, then exit 2.
`);
	process.exit(0);
}

const dryRun = Boolean(values["dry-run"]);
const cacheOnly = Boolean(values["cache-only"]);
const fromCache = Boolean(values["from-cache"]);
const windowHours = clampInt(values["window-hours"] ?? env("XRAY_WINDOW_HOURS"), 24, 1, 168);
const twitterMax = clampInt(values.max ?? env("XRAY_TWITTER_MAX"), 20, 1, 100);
const handleDelayMs = clampInt(values["handle-delay-ms"], 3000, 0, 60_000);
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
// Default cache root uses adapter id; override with XRAY_CACHE_DIR.
const cacheDir = resolve(values["cache-dir"] ?? env("XRAY_CACHE_DIR") ?? ".cache/twitter-cli");

function env(name: string): string | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: bun/process env
	const p = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
	return p?.env?.[name];
}

function fullEnv(): Record<string, string | undefined> {
	// biome-ignore lint/suspicious/noExplicitAny: bun/process env
	const p = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
	return p?.env ?? {};
}

async function bunSpawn(
	argv: string[],
	opts: { env: Record<string, string> },
): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: opts.env });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const code = await proc.exited;
	// workerd/bun sometimes exit 1 with empty output when binary missing
	if (code === 127 || (code !== 0 && /not found|ENOENT/i.test(`${stderr}\n${stdout}`))) {
		const err = Object.assign(new Error(stderr || stdout || `command not found: ${argv[0]}`), {
			code: code === 127 ? "ENOENT" : undefined,
		});
		throw err;
	}
	return { code, stdout, stderr };
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
		return parseMembersGraph(JSON.parse(readFileSync(membersFile, "utf8")) as unknown);
	}
	if (!browserBase) {
		throw new Error(
			"No graph source: set --members-file / XRAY_MEMBERS_FILE or XRAY_BROWSER_BASE (see docs/09)",
		);
	}
	return fetchGraphFromBrowser(browserBase);
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
	if (!wlRes.ok) throw new Error(`GET /api/watchlists → ${wlRes.status}`);
	const wlBody = (await wlRes.json()) as { data?: Array<{ id: number; name: string }> };
	const lists = wlBody.data ?? [];
	const watchlists: Graph["watchlists"] = [];
	for (const wl of lists) {
		const mRes = await fetch(`${base}/api/watchlists/${wl.id}/members`, { headers });
		if (!mRes.ok) throw new Error(`GET members ${wl.id} → ${mRes.status}`);
		const mBody = (await mRes.json()) as {
			data?: Array<{ handle: string; sourceType: string }>;
		};
		const xMembers = (mBody.data ?? []).filter((m) => m.sourceType === "x.com");
		if (xMembers.length === 0) {
			watchlists.push({ id: wl.id, name: wl.name, members: [] });
			continue;
		}
		const parsed = parseMembersGraph({
			watchlists: [
				{
					id: wl.id,
					name: wl.name,
					members: xMembers.map((m) => ({ handle: m.handle, sourceType: "x.com" as const })),
				},
			],
		});
		const one = parsed.watchlists[0];
		if (!one) throw new Error(`parse failed for wl ${wl.id}`);
		watchlists.push(one);
	}
	return parseMembersGraph({ watchlists });
}

function uniqueHandles(graph: Graph): Map<string, number[]> {
	const map = new Map<string, number[]>();
	for (const wl of graph.watchlists) {
		for (const m of wl.members) {
			if (!isValidXHandle(m.handle)) continue;
			const arr = map.get(m.handle) ?? [];
			if (!arr.includes(wl.id)) arr.push(wl.id);
			map.set(m.handle, arr);
		}
	}
	return map;
}

/** Sole vendor touchpoint in this script — swap factory to replace twitter-cli. */
function createTimelineSource(): XTimelineSource {
	return createTwitterCliSource({
		spawn: bunSpawn,
		bin: twitterBin,
		env: fullEnv(),
		max: twitterMax,
	});
}

function rawPathFor(sourceId: string, handle: string): string {
	const base = cacheFileBase(handle);
	const dir = join(cacheDir, "raw");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, `${base}.json`);
	if (!resolve(path).startsWith(resolve(dir))) throw new Error(`cache path escape: ${path}`);
	void sourceId; // reserved for multi-adapter cache namespaces
	return path;
}

async function pushBatch(body: {
	watchlist_id: number;
	items: CanonicalItem[];
	options?: { apply_window_hours?: number };
}) {
	return pushIngestBatch(
		{
			fetch: async (url, init) => {
				const res = await fetch(url, init);
				return { status: res.status, ok: res.ok, text: () => res.text() };
			},
			sleep,
			ingestBase,
			pushToken,
		},
		body,
	);
}

function writeReport(report: unknown): string {
	mkdirSync(cacheDir, { recursive: true });
	const reportPath = join(cacheDir, `run-${Date.now()}.json`);
	writeFileSync(reportPath, JSON.stringify(report, null, 2));
	return reportPath;
}

async function main(): Promise<void> {
	mkdirSync(cacheDir, { recursive: true });
	const source = createTimelineSource();
	const graph = await loadGraph();
	const handleMap = uniqueHandles(graph);
	const wlById = new Map(graph.watchlists.map((w) => [w.id, w]));

	console.log(
		JSON.stringify(
			{
				event: "plan",
				source: source.id,
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
		for (const [h, wls] of handleMap) console.log(`  @${h} → WL ${wls.join(",")}`);
		process.exit(0);
	}

	if (!fromCache) {
		await source.ready();
		console.log(`timeline source OK (${source.id})`);
	}
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
			const rawPath = rawPathFor(source.id, handle);
			let result: Awaited<ReturnType<XTimelineSource["fetchHandle"]>>;
			if (fromCache) {
				if (!existsSync(rawPath)) throw new Error(`cache miss: ${rawPath}`);
				const raw = JSON.parse(readFileSync(rawPath, "utf8")) as unknown;
				result = source.parseCachedRaw(raw);
			} else {
				result = await source.fetchHandle(handle);
				atomicWriteJson(
					rawPath,
					result.raw,
					{ writeFileSync, renameSync, unlinkSync },
					process.pid,
				);
			}
			totalMapped += result.items.length;
			totalSkipped += result.skipped.length;
			if (result.items.length === 0 && result.skipped.length > 0) {
				handleErrors.push({
					handle,
					error: `all tweets failed convert (${result.skipped.length} skipped)`,
				});
			}
			const { kept, dropped } = filterItemsByWindow(result.items, windowHours);
			totalWindowDropped += dropped;
			itemsByHandle.set(handle, kept);
			writeFileSync(
				join(cacheDir, "raw", `${cacheFileBase(handle)}.canonical.json`),
				JSON.stringify(kept, null, 2),
			);
			console.log(
				`  mapped=${result.items.length} skipped=${result.skipped.length} in_window=${kept.length}`,
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			const kind =
				e && typeof e === "object" && "kind" in e
					? String((e as { kind?: string }).kind)
					: undefined;
			handleErrors.push({ handle, error: msg.split("\n")[0] ?? msg });
			if (kind === "not_installed" || kind === "not_authenticated") {
				console.error(msg);
				console.error(
					`\nAborting remaining handles — fix ${source.id} install/login, or use --from-cache.`,
				);
				break;
			}
			console.error(`  ERROR @${handle}: ${msg.split("\n")[0] ?? msg}`);
			if (kind === "rate_limited" || /rate_limited/i.test(msg)) {
				console.warn("  cooling 60s after rate limit…");
				await sleep(60_000);
			}
		}
		if (!fromCache && handleDelayMs > 0 && i < handleMap.size) await sleep(handleDelayMs);
	}

	const itemsByWl = new Map<number, Map<string, CanonicalItem>>();
	for (const [handle, items] of itemsByHandle) {
		for (const wlId of handleMap.get(handle) ?? []) {
			let bag = itemsByWl.get(wlId);
			if (!bag) {
				bag = new Map();
				itemsByWl.set(wlId, bag);
			}
			for (const it of items) if (!bag.has(it.external_id)) bag.set(it.external_id, it);
		}
	}

	const summary: Array<Record<string, unknown>> = [];
	let pushErrors = 0;
	let fatalPush = false;
	let totalRejected = 0;

	const finalize = (code: number) => {
		const report = {
			event: cacheOnly ? "cache_only_done" : "refresh_done",
			windowHours,
			totalMapped,
			totalSkipped,
			totalWindowDropped,
			totalRejected,
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
		finalize(
			exitCodeForRefresh({
				handleErrors: handleErrors.length,
				pushErrors: 0,
				totalRejected: 0,
				handlesPlanned: handleMap.size,
				handlesOk: itemsByHandle.size,
				fatalPush: false,
			}),
		);
		return;
	}

	for (const [wlId, bag] of itemsByWl) {
		const items = [...bag.values()];
		const batches = buildIngestBatches(wlId, items, { apply_window_hours: windowHours });
		let accepted = 0;
		let deduped = 0;
		let rejected = 0;
		const errors: string[] = [];
		const itemErrors: unknown[] = [];
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
			totalRejected += res.rejected ?? 0;
			if (res.itemErrors !== undefined) itemErrors.push(res.itemErrors);
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
			itemErrors: itemErrors.length ? itemErrors : undefined,
		});
		console.log(
			`WL ${wlId} ${wlById.get(wlId)?.name}: items=${items.length} accepted=${accepted} deduped=${deduped} rejected=${rejected}`,
		);
		if (fatalPush) break;
	}

	const code = exitCodeForRefresh({
		handleErrors: handleErrors.length,
		pushErrors,
		totalRejected,
		handlesPlanned: handleMap.size,
		handlesOk: itemsByHandle.size,
		fatalPush,
	});
	const emptyMaps =
		handleMap.size > 0 &&
		itemsByHandle.size > 0 &&
		totalMapped === 0 &&
		[...itemsByHandle.values()].every((a) => a.length === 0);
	finalize(code !== 0 || emptyMaps ? 1 : 0);
}

main().catch((e) => {
	const msg = e instanceof Error ? e.message : String(e);
	// Multi-line guidance (install / re-login) — print as-is to stderr
	console.error(msg);
	const kind =
		e && typeof e === "object" && "kind" in e ? String((e as { kind?: string }).kind) : undefined;
	try {
		writeReport({ event: "fatal", error: msg, kind });
	} catch {
		/* ignore */
	}
	// 2 = operator preflight (missing cli / login); 1 = run failure
	process.exit(kind === "not_installed" || kind === "not_authenticated" ? 2 : 1);
});
