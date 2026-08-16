#!/usr/bin/env bun
/**
 * Local producer orchestrator — source-agnostic after XTimelineSource boundary.
 * Default adapter: twitter-cli (createTwitterCliSource). Swap adapter to replace vendor.
 *
 * Docs: docs/09-local-producer-twitter-cli.md § boundary
 * Schedule: docs/10-refresh-schedule.md
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
	applyExplicitMembersFile,
	assertAllowedBaseUrl,
	atomicWriteJson,
	buildIngestBatches,
	buildRefreshSchedule,
	type CanonicalItem,
	cacheFileBase,
	createTwitterCliSource,
	DEFAULT_MIN_GAP_MS,
	DEFAULT_SPREAD_WINDOW_MS,
	deferHandleInSchedule,
	exitCodeForRefresh,
	fetchIngestGraph,
	filterItemsByWindow,
	isValidXHandle,
	type parseMembersGraph,
	pushIngestBatch,
	rateLimitPauseMs,
	rebaseScheduleQueue,
	resolveIngestBase,
	type ScheduleSlot,
	selectHandlesForEpoch,
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
			env: { type: "string" },
			"twitter-bin": { type: "string" },
			"handle-delay-ms": { type: "string" },
			"spread-window-min": { type: "string" },
			"min-gap-ms": { type: "string" },
			"no-spread": { type: "boolean", default: false },
			"refresh-mode": { type: "string" },
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
  --members-file PATH After live graph, override if this file exists
  --window-hours N    Ingest window 1..168 (default: XRAY_WINDOW_HOURS or 24)
  --max N             twitter user-posts --max (default: 20; CLI may page up to N)
  --cache-dir PATH    Raw cache root (default: XRAY_CACHE_DIR or .cache/twitter-cli)
  --ingest-base URL   Override ingest host (graph + push)
  --env prod|dev      Sugar for ingest base (dev → 127.0.0.1:8787)
  --twitter-bin PATH  Default TWITTER_BIN or twitter
  --spread-window-min N  Spread starts across N minutes (default 60). See docs/10.
  --min-gap-ms N      Min gap between handle starts (default 12000)
  --no-spread         Legacy fixed-delay mode (use with --handle-delay-ms)
  --handle-delay-ms N Legacy: fixed sleep between calls (implies --no-spread if set)
  --refresh-mode MODE full|incremental (default full; incremental uses last-success age)

Env: XRAY_PUSH_TOKEN, XRAY_INGEST_BASE, XRAY_ENV, XRAY_WINDOW_HOURS, XRAY_TWITTER_MAX, TWITTER_BIN

Notes:
  Default: shuffle handles and spread starts over 60 minutes (docs/10-refresh-schedule.md).
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
const handleDelayExplicit =
	values["handle-delay-ms"] !== undefined && values["handle-delay-ms"] !== "";
const noSpread = Boolean(values["no-spread"]) || handleDelayExplicit;
const handleDelayMs = clampInt(values["handle-delay-ms"], 3000, 0, 60_000);
const spreadWindowMin = clampInt(values["spread-window-min"], 60, 1, 24 * 60);
const minGapMs = clampInt(values["min-gap-ms"], DEFAULT_MIN_GAP_MS, 0, 600_000);
const refreshModeRaw = (values["refresh-mode"] ?? env("XRAY_REFRESH_MODE") ?? "full").toLowerCase();
if (refreshModeRaw !== "full" && refreshModeRaw !== "incremental") {
	console.error(`invalid --refresh-mode ${refreshModeRaw} (want full|incremental)`);
	process.exit(2);
}
const refreshMode = refreshModeRaw as "full" | "incremental";
const spreadWindowMs = noSpread ? 0 : spreadWindowMin * 60_000 || DEFAULT_SPREAD_WINDOW_MS;
const envMode = (values.env ?? env("XRAY_ENV") ?? "prod").toLowerCase();
if (envMode !== "prod" && envMode !== "dev") {
	console.error(`invalid --env ${envMode} (want prod|dev)`);
	process.exit(2);
}
const ingestBase = assertAllowedBaseUrl(
	resolveIngestBase({
		cliBase: values["ingest-base"],
		cliEnv: values.env,
		envBase: env("XRAY_INGEST_BASE"),
		envMode: env("XRAY_ENV"),
	}),
	"ingest",
);
const twitterBin = values["twitter-bin"] ?? env("TWITTER_BIN") ?? "twitter";
const pushToken = env("XRAY_PUSH_TOKEN") ?? "";
const membersFile = values["members-file"];
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

function loadLastSuccessMs(path: string): Record<string, number> {
	const out = Object.create(null) as Record<string, number>;
	try {
		if (!existsSync(path)) return out;
		const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
		for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
			if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
		}
		return out;
	} catch {
		return out;
	}
}

/**
 * OS-held exclusive lock via python3 fcntl.flock (true advisory lock; no rename CAS).
 * Helper process holds LOCK_EX until stdin EOF or parent pid dies (2s poll).
 */
/**
 * Keep the lock *path* forever — only unlock flock, never unlink.
 * Unlink after unlock splits inodes: B locks old inode, A unlinks, C creates new → B||C.
 */
const EPOCH_FLOCK_HELPER = `
import fcntl, json, os, select, sys, time
path, parent = sys.argv[1], int(sys.argv[2])
fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.stderr.write(json.dumps({"event": "epoch_lock_busy", "lockPath": path, "hint": "another refresh holds flock"}) + "\\n")
    sys.exit(3)
except OSError as e:
    # errno 11 EAGAIN / 35 EWOULDBLOCK (macOS)
    if getattr(e, "errno", None) in (11, 35):
        sys.stderr.write(json.dumps({"event": "epoch_lock_busy", "lockPath": path, "hint": "another refresh holds flock"}) + "\\n")
        sys.exit(3)
    raise
body = json.dumps({"pid": parent, "at": int(time.time() * 1000)})
os.ftruncate(fd, 0)
os.lseek(fd, 0, os.SEEK_SET)
os.write(fd, body.encode())
os.fsync(fd)
sys.stdout.write("LOCKED\\n")
sys.stdout.flush()
# Hold until parent dies or parent closes/writes stdin (explicit release).
while True:
    try:
        os.kill(parent, 0)
    except ProcessLookupError:
        break
    except PermissionError:
        pass
    r, _, _ = select.select([sys.stdin], [], [], 2.0)
    if not r:
        continue
    os.read(sys.stdin.fileno(), 4096)
    # EOF (pipe closed) or any byte = release
    break
try:
    fcntl.flock(fd, fcntl.LOCK_UN)
except OSError:
    pass
os.close(fd)
# Do NOT unlink path — permanent inode avoids split-brain after unlock.
`;

type EpochLockHolder = {
	proc: ReturnType<typeof Bun.spawn>;
	lockPath: string;
};

let epochLockHolder: EpochLockHolder | null = null;

async function acquireEpochLock(lockPath: string): Promise<void> {
	mkdirSync(join(lockPath, ".."), { recursive: true });
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn(["python3", "-c", EPOCH_FLOCK_HELPER, lockPath, String(process.pid)], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (e) {
		console.error(
			JSON.stringify({
				event: "epoch_lock_error",
				error: e instanceof Error ? e.message : String(e),
				hint: "python3 required for epoch flock",
			}),
		);
		process.exit(3);
	}

	const handshake = (async (): Promise<
		{ ok: true } | { ok: false; errText: string; code: number }
	> => {
		const reader = proc.stdout.getReader();
		const dec = new TextDecoder();
		let buf = "";
		try {
			while (!buf.includes("\n")) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
			}
		} catch {
			/* fall through */
		}
		if (buf.startsWith("LOCKED")) return { ok: true };
		let errText = "";
		try {
			errText = await new Response(proc.stderr).text();
		} catch {
			/* ignore */
		}
		const code = await proc.exited;
		return { ok: false, errText, code };
	})();

	const timed = await Promise.race([
		handshake.then((r) => ({ kind: "done" as const, r })),
		new Promise<{ kind: "timeout" }>((resolve) => {
			setTimeout(() => resolve({ kind: "timeout" }), 5_000);
		}),
	]);

	if (timed.kind === "timeout") {
		try {
			proc.kill();
		} catch {
			/* ignore */
		}
		try {
			proc.stdin?.end();
		} catch {
			/* ignore */
		}
		console.error(
			JSON.stringify({
				event: "epoch_lock_timeout",
				lockPath,
				hint: "python3 flock handshake exceeded 5s",
			}),
		);
		process.exit(3);
	}

	const result = timed.r;
	if (!result.ok) {
		let parsed: { event?: string; hint?: string } | null = null;
		try {
			parsed = JSON.parse(result.errText.trim().split("\n").pop() || "{}") as {
				event?: string;
				hint?: string;
			};
		} catch {
			/* ignore */
		}
		console.error(
			JSON.stringify({
				event: parsed?.event ?? "epoch_lock_busy",
				lockPath,
				exitCode: result.code,
				hint: parsed?.hint ?? "another refresh is running or python3 flock failed",
				stderr: result.errText.slice(0, 400) || undefined,
			}),
		);
		process.exit(3);
	}

	// Keep helper alive; do not cancel reader/process until release.
	epochLockHolder = { proc, lockPath };
}

function releaseEpochLock(_lockPath?: string): void {
	const holder = epochLockHolder;
	epochLockHolder = null;
	if (!holder) return;
	try {
		holder.proc.stdin?.end();
	} catch {
		/* ignore */
	}
	// Best-effort: do not block shutdown on helper exit.
	void holder.proc.exited.catch(() => undefined);
}

async function loadGraph(): Promise<Graph> {
	if (!pushToken) {
		throw new Error("XRAY_PUSH_TOKEN required to fetch ingest graph");
	}
	const live = await fetchIngestGraph({
		fetch: async (url, init) => {
			const res = await fetch(url, init);
			return { status: res.status, ok: res.ok, text: () => res.text() };
		},
		ingestBase,
		pushToken,
	});
	return applyExplicitMembersFile(live, membersFile, {
		exists: existsSync,
		read: (p) => readFileSync(p, "utf8"),
	});
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
	const lastSuccessPath = join(cacheDir, "last-success.json");
	const lastSuccessMs = loadLastSuccessMs(lastSuccessPath);
	const selected = selectHandlesForEpoch({
		allHandles: [...handleMap.keys()],
		mode: refreshMode,
		lastSuccessMs,
		nowMs: Date.now(),
	});
	const epochStartMs = Date.now();
	const schedule = noSpread
		? null
		: buildRefreshSchedule({
				handles: selected,
				startMs: epochStartMs,
				epochMs: spreadWindowMs || DEFAULT_SPREAD_WINDOW_MS,
				minGapMs,
			});
	const epochEndMs =
		epochStartMs + (schedule?.epochMs ?? (spreadWindowMs || DEFAULT_SPREAD_WINDOW_MS));
	/** Allow timer/event-loop slop so the last planned slot is still startable. */
	const epochStartDeadlineMs = epochEndMs + 5_000;

	console.log(
		JSON.stringify(
			{
				event: "plan",
				source: source.id,
				watchlists: graph.watchlists.length,
				uniqueHandles: handleMap.size,
				selectedHandles: selected.length,
				refreshMode,
				windowHours,
				twitterMax,
				dryRun,
				cacheOnly,
				fromCache,
				noSpread,
				handleDelayMs: noSpread ? handleDelayMs : undefined,
				spreadWindowMin: noSpread ? undefined : spreadWindowMin,
				minGapMs: noSpread ? undefined : minGapMs,
				idealSlotMs: schedule?.idealSlotMs,
				epochMs: schedule?.epochMs ?? (noSpread ? undefined : spreadWindowMs),
				epochExpanded: schedule?.epochExpanded,
				ingestBase,
				cacheDir,
			},
			null,
			2,
		),
	);

	if (dryRun) {
		for (const [h, wls] of handleMap) {
			const on = selected.includes(h) ? "selected" : "skip";
			console.log(`  @${h} → WL ${wls.join(",")} (${on})`);
		}
		if (schedule) {
			console.log(JSON.stringify({ event: "schedule_preview", slots: schedule.slots }, null, 2));
		}
		process.exit(0);
	}

	// Incremental no-op: nothing stale — skip twitter login / push token requirements.
	if (selected.length === 0) {
		console.log(
			JSON.stringify({ event: "noop", reason: "no handles selected for epoch", refreshMode }),
		);
		const reportPath = writeReport({
			event: "refresh_done",
			refreshMode,
			selectedHandles: 0,
			handleErrors: [],
			pushErrors: 0,
			summary: [],
		});
		console.log(`report: ${reportPath}`);
		process.exit(0);
	}

	const lockPath = join(cacheDir, "epoch.lock");
	await acquireEpochLock(lockPath);
	const releaseLock = () => releaseEpochLock(lockPath);
	process.on("exit", releaseLock);
	process.on("SIGINT", () => {
		releaseLock();
		process.exit(130);
	});
	process.on("SIGTERM", () => {
		releaseLock();
		process.exit(143);
	});

	if (!fromCache) {
		await source.ready();
		console.log(`timeline source OK (${source.id})`);
	}
	if (!cacheOnly && !pushToken) {
		console.error("XRAY_PUSH_TOKEN required for push (or use --cache-only / --dry-run)");
		releaseLock();
		process.exit(2);
	}

	const itemsByHandle = new Map<string, CanonicalItem[]>();
	type HandleErrorRow = {
		handle: string;
		error: string;
		kind?: string;
		durationMs: number;
		debug?: unknown;
		debugPath?: string;
		deferred?: boolean;
	};
	const handleErrors: HandleErrorRow[] = [];
	const permanentlyFailed = new Set<string>();
	let totalMapped = 0;
	let totalSkipped = 0;
	let totalWindowDropped = 0;
	const debugDir = join(cacheDir, "debug");
	mkdirSync(debugDir, { recursive: true });

	async function fetchOne(
		handle: string,
		i: number,
		total: number,
	): Promise<"ok" | "fatal" | "rate_limited" | "failed"> {
		const t0 = Date.now();
		try {
			console.log(
				JSON.stringify({
					event: "fetch_start",
					i,
					total,
					handle,
					fromCache,
					mode: noSpread ? "fixed-delay" : "spread",
				}),
			);
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
					kind: "convert_all_skipped",
					durationMs: Date.now() - t0,
				});
			}
			const { kept, dropped } = filterItemsByWindow(result.items, windowHours);
			totalWindowDropped += dropped;
			itemsByHandle.set(handle, kept);
			// Only live network fetches advance incremental watermark (not --from-cache).
			if (!fromCache) lastSuccessMs[handle] = Date.now();
			writeFileSync(
				join(cacheDir, "raw", `${cacheFileBase(handle)}.canonical.json`),
				JSON.stringify(kept, null, 2),
			);
			console.log(
				JSON.stringify({
					event: "fetch_ok",
					handle,
					durationMs: Date.now() - t0,
					mapped: result.items.length,
					skipped: result.skipped.length,
					inWindow: kept.length,
					windowDropped: dropped,
				}),
			);
			return "ok";
		} catch (e) {
			const durationMs = Date.now() - t0;
			const msg = e instanceof Error ? e.message : String(e);
			const kind =
				e && typeof e === "object" && "kind" in e
					? String((e as { kind?: string }).kind)
					: undefined;
			const debug =
				e && typeof e === "object" && "debug" in e ? (e as { debug?: unknown }).debug : undefined;
			const rateLimited =
				e && typeof e === "object" && "rateLimited" in e
					? Boolean((e as { rateLimited?: boolean }).rateLimited)
					: kind === "rate_limited" || /rate_limited/i.test(msg);

			const debugPayload = {
				event: "fetch_error",
				handle,
				i,
				total,
				durationMs,
				kind: kind ?? "unknown",
				rateLimited,
				error: msg.split("\n")[0] ?? msg,
				debug: debug ?? null,
				stack: e instanceof Error ? e.stack?.split("\n").slice(0, 8) : undefined,
				at: new Date().toISOString(),
			};
			const debugPath = join(debugDir, `${cacheFileBase(handle)}-${Date.now()}.json`);
			try {
				writeFileSync(debugPath, JSON.stringify(debugPayload, null, 2));
			} catch {
				/* ignore disk errors */
			}

			handleErrors.push({
				handle,
				error: msg.split("\n")[0] ?? msg,
				kind: kind ?? "unknown",
				durationMs,
				debug: debug ?? null,
				debugPath,
			});

			console.error(`  ERROR @${handle} (${durationMs}ms) kind=${kind ?? "unknown"}`);
			console.error(msg);
			console.error(
				JSON.stringify(
					{
						event: "fetch_error_debug",
						handle,
						kind: kind ?? "unknown",
						rateLimited,
						durationMs,
						debug: debug ?? null,
						debugPath,
					},
					null,
					2,
				),
			);

			if (kind === "not_installed" || kind === "not_authenticated") return "fatal";
			if (rateLimited) return "rate_limited";
			return "failed";
		}
	}

	if (noSpread || fromCache) {
		// Legacy fixed-delay path (or offline cache: no need to spread)
		let i = 0;
		const list = selected;
		for (const handle of list) {
			i += 1;
			const status = await fetchOne(handle, i, list.length);
			if (status === "fatal") {
				console.error(
					`\nAborting remaining handles — fix ${source.id} install/login, or use --from-cache.`,
				);
				break;
			}
			if (status === "rate_limited") {
				const pause = rateLimitPauseMs({ nowMs: Date.now(), epochEndMs: Date.now() + 600_000 });
				console.warn(JSON.stringify({ event: "rate_limit_pause", ms: pause, handle }));
				await sleep(pause);
			}
			if (!fromCache && handleDelayMs > 0 && i < list.length) {
				console.log(JSON.stringify({ event: "handle_delay", ms: handleDelayMs, after: handle }));
				await sleep(handleDelayMs);
			}
		}
	} else {
		// 60min (default) spread schedule
		let queue: ScheduleSlot[] = (schedule?.slots ?? []).slice();
		const planned = queue.length;
		let completed = 0;
		const deferredOnce = new Set<string>();

		console.log(
			JSON.stringify({
				event: "schedule",
				planned,
				epochStartMs,
				epochEndMs,
				epochMs: schedule?.epochMs,
				minGapMs,
				idealSlotMs: schedule?.idealSlotMs,
				firstAt: queue[0]?.atMs,
				lastAt: queue[queue.length - 1]?.atMs,
			}),
		);

		let lastStartMs = 0;
		while (queue.length) {
			const slot = queue[0];
			if (!slot) break;
			if (Date.now() > epochStartDeadlineMs) {
				// Epoch wall clock exceeded — do not start more fetches (Codex P1).
				for (const s of queue) {
					permanentlyFailed.add(s.handle);
					handleErrors.push({
						handle: s.handle,
						error: "dropped: epoch wall clock exceeded before start",
						kind: "epoch_overflow",
						durationMs: 0,
					});
				}
				console.warn(
					JSON.stringify({
						event: "epoch_timeout",
						remaining: queue.length,
						handles: queue.map((s) => s.handle),
					}),
				);
				break;
			}
			// Enforce minGap against actual previous start (fetch overrun can leave many past slots).
			const earliest = lastStartMs > 0 ? lastStartMs + minGapMs : 0;
			const targetAt = Math.max(slot.atMs, earliest, Date.now());
			if (targetAt > epochStartDeadlineMs) {
				for (const s of queue) {
					permanentlyFailed.add(s.handle);
					handleErrors.push({
						handle: s.handle,
						error: "dropped: next start would exceed epoch end",
						kind: "epoch_overflow",
						durationMs: 0,
					});
				}
				console.warn(
					JSON.stringify({
						event: "epoch_overflow",
						remaining: queue.length,
						handles: queue.map((s) => s.handle),
					}),
				);
				break;
			}
			const wait = targetAt - Date.now();
			if (wait > 0) {
				console.log(
					JSON.stringify({
						event: "schedule_wait",
						handle: slot.handle,
						waitMs: wait,
						atMs: targetAt,
						plannedAtMs: slot.atMs,
					}),
				);
				await sleep(wait);
			}
			// Re-check after sleep (suspend / stall can cross deadline).
			if (Date.now() > epochStartDeadlineMs) {
				for (const s of queue) {
					permanentlyFailed.add(s.handle);
					handleErrors.push({
						handle: s.handle,
						error: "dropped: epoch ended during schedule_wait",
						kind: "epoch_overflow",
						durationMs: 0,
					});
				}
				console.warn(
					JSON.stringify({
						event: "epoch_timeout_after_wait",
						remaining: queue.length,
						handles: queue.map((s) => s.handle),
					}),
				);
				break;
			}
			queue = queue.slice(1);
			completed += 1;
			lastStartMs = Date.now();
			const status = await fetchOne(slot.handle, completed, planned);
			if (status === "fatal") {
				console.error(
					`\nAborting remaining handles — fix ${source.id} install/login, or use --from-cache.`,
				);
				break;
			}
			if (status === "rate_limited") {
				const now = Date.now();
				const pause = rateLimitPauseMs({ nowMs: now, epochEndMs });
				console.warn(
					JSON.stringify({
						event: "rate_limit_pause",
						ms: pause,
						handle: slot.handle,
						deferredOnce: deferredOnce.has(slot.handle),
					}),
				);
				// Epoch already over: do not sleep or defer — fail this handle and drain.
				if (pause <= 0) {
					permanentlyFailed.add(slot.handle);
					for (const s of queue) {
						permanentlyFailed.add(s.handle);
						handleErrors.push({
							handle: s.handle,
							error: "dropped: epoch ended before rate-limit recovery",
							kind: "epoch_overflow",
							durationMs: 0,
						});
					}
					queue = [];
					continue;
				}
				await sleep(pause);
				// Past slots must not fire back-to-back after a multi-minute pause (Codex P1).
				const rebased = rebaseScheduleQueue({
					queue,
					nowMs: Date.now(),
					minGapMs,
					epochEndMs,
				});
				queue = rebased.queue;
				for (const h of rebased.dropped) {
					permanentlyFailed.add(h);
					handleErrors.push({
						handle: h,
						error: "dropped: no room left in epoch after rate-limit pause",
						kind: "epoch_overflow",
						durationMs: 0,
					});
				}
				if (rebased.dropped.length) {
					console.warn(
						JSON.stringify({
							event: "schedule_rebase_drop",
							dropped: rebased.dropped,
						}),
					);
				}
				if (!deferredOnce.has(slot.handle)) {
					deferredOnce.add(slot.handle);
					const before = queue.length;
					queue = deferHandleInSchedule({
						remaining: queue,
						handle: slot.handle,
						notBeforeMs: Date.now() + 1_000,
						minGapMs,
						epochEndMs,
					});
					const fitted = queue.some((s) => s.handle === slot.handle);
					console.log(
						JSON.stringify({
							event: "schedule_defer",
							handle: slot.handle,
							fitted,
							queueBefore: before,
							queueAfter: queue.length,
						}),
					);
					if (!fitted) permanentlyFailed.add(slot.handle);
					// Soft-fail while deferred: drop from handleErrors so recovered runs exit 0
					if (fitted) {
						for (let hi = handleErrors.length - 1; hi >= 0; hi--) {
							const row = handleErrors[hi];
							if (row && row.handle === slot.handle && row.kind === "rate_limited") {
								row.deferred = true;
								handleErrors.splice(hi, 1);
								break;
							}
						}
					}
				} else {
					permanentlyFailed.add(slot.handle);
				}
			} else if (status === "ok") {
				// Successful retry: ensure no stale rate_limited rows remain for this handle
				for (let hi = handleErrors.length - 1; hi >= 0; hi--) {
					const row = handleErrors[hi];
					if (row && row.handle === slot.handle && row.kind === "rate_limited") {
						handleErrors.splice(hi, 1);
					}
				}
			}
		}
	}

	// Re-apply ingest window immediately before push — early-fetched items can age
	// out during a ~60m epoch (Codex P2).
	const itemsByWl = new Map<number, Map<string, CanonicalItem>>();
	for (const [handle, items] of itemsByHandle) {
		const { kept, dropped } = filterItemsByWindow(items, windowHours);
		totalWindowDropped += dropped;
		itemsByHandle.set(handle, kept);
		for (const wlId of handleMap.get(handle) ?? []) {
			let bag = itemsByWl.get(wlId);
			if (!bag) {
				bag = new Map();
				itemsByWl.set(wlId, bag);
			}
			for (const it of kept) if (!bag.has(it.external_id)) bag.set(it.external_id, it);
		}
	}

	const summary: Array<Record<string, unknown>> = [];
	let pushErrors = 0;
	let fatalPush = false;
	let totalRejected = 0;

	const persistWatermarks = (ok: boolean): "skipped" | "ok" | "error" => {
		// Live-fetch watermarks: after successful push, or always for cache-only
		// (cache-only is local convert only — still marks "processed this epoch").
		if (!ok && !cacheOnly) return "skipped";
		try {
			atomicWriteJson(
				lastSuccessPath,
				lastSuccessMs,
				{ writeFileSync, renameSync, unlinkSync },
				process.pid,
			);
			return "ok";
		} catch (e) {
			console.error(
				JSON.stringify({
					event: "watermark_persist_failed",
					path: lastSuccessPath,
					error: e instanceof Error ? e.message : String(e),
				}),
			);
			return "error";
		}
	};

	const finalize = (code: number) => {
		const wm = persistWatermarks(code === 0);
		const exitCode = wm === "error" && code === 0 ? 1 : code;
		const report = {
			event: cacheOnly ? "cache_only_done" : "refresh_done",
			windowHours,
			refreshMode,
			noSpread,
			handleDelayMs: noSpread ? handleDelayMs : undefined,
			spreadWindowMin: noSpread ? undefined : spreadWindowMin,
			minGapMs: noSpread ? undefined : minGapMs,
			epochStartMs,
			epochEndMs,
			epochStartDeadlineMs: noSpread ? undefined : epochStartDeadlineMs,
			fromCache,
			cacheOnly,
			selectedHandles: selected.length,
			totalMapped,
			totalSkipped,
			totalWindowDropped,
			totalRejected,
			handleErrors,
			permanentlyFailed: [...permanentlyFailed],
			pushErrors,
			watermarkPersist: wm,
			summary,
			debugDir,
		};
		const reportPath = writeReport(report);
		if (handleErrors.length) {
			console.error(
				JSON.stringify(
					{
						event: "handle_errors_summary",
						count: handleErrors.length,
						handles: handleErrors.map((h) => ({
							handle: h.handle,
							kind: h.kind,
							durationMs: h.durationMs,
							error: h.error,
							debugPath: h.debugPath,
							rateLimitMatch:
								h.debug &&
								typeof h.debug === "object" &&
								h.debug !== null &&
								"rateLimitMatch" in h.debug
									? (h.debug as { rateLimitMatch?: string | null }).rateLimitMatch
									: undefined,
						})),
					},
					null,
					2,
				),
			);
		}
		console.log(JSON.stringify(report, null, 2));
		console.log(`report: ${reportPath}`);
		releaseEpochLock(lockPath);
		process.exit(exitCode);
	};

	if (cacheOnly) {
		finalize(
			exitCodeForRefresh({
				handleErrors: handleErrors.length,
				pushErrors: 0,
				totalRejected: 0,
				handlesPlanned: selected.length,
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
		handlesPlanned: selected.length,
		handlesOk: itemsByHandle.size,
		fatalPush,
	});
	// Incremental no-op (selected empty) is success — do not treat as emptyMaps fail.
	const emptyMaps =
		selected.length > 0 &&
		itemsByHandle.size > 0 &&
		totalMapped === 0 &&
		[...itemsByHandle.values()].every((a) => a.length === 0);
	const exit = code !== 0 || emptyMaps ? 1 : 0;
	finalize(exit);
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
