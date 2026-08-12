/**
 * Refresh epoch scheduling — pure, testable.
 * Spreads handle fetches across a time box with min-gap + jitter.
 * Docs: docs/10-refresh-schedule.md
 */

export const DEFAULT_SPREAD_WINDOW_MS = 60 * 60_000;
/** Cookie/GraphQL path: keep gaps well above the old 3s sprint. */
export const DEFAULT_MIN_GAP_MS = 12_000;
export const DEFAULT_MAX_JITTER_MS = 20_000;
export const DEFAULT_JITTER_RATIO = 0.3;
/** When 429 and no x-rate-limit-reset: pause randomly in this band (ms). */
export const DEFAULT_429_PAUSE_MIN_MS = 120_000;
export const DEFAULT_429_PAUSE_MAX_MS = 300_000;

export type ScheduleSlot = {
	handle: string;
	/** Absolute epoch ms when this fetch should start. */
	atMs: number;
	/** 0-based order in the final timeline. */
	index: number;
};

export type BuildRefreshScheduleInput = {
	handles: string[];
	startMs: number;
	/** Target wall time to finish all starts (not including last fetch duration). */
	epochMs?: number;
	minGapMs?: number;
	/** Fraction of ideal slot used as ±jitter (capped by maxJitterMs). */
	jitterRatio?: number;
	maxJitterMs?: number;
	/** Shuffle before laying out (default true). */
	shuffle?: boolean;
	/** RNG in [0, 1). Inject for tests. */
	random?: () => number;
};

export type BuildRefreshScheduleResult = {
	slots: ScheduleSlot[];
	epochMs: number;
	minGapMs: number;
	idealSlotMs: number;
	/** True when N*minGap > epoch — epoch was expanded to fit. */
	epochExpanded: boolean;
	/** Handles in schedule order. */
	order: string[];
};

function defaultRandom(): number {
	return Math.random();
}

function atIndex(arr: number[], i: number): number {
	const v = arr[i];
	if (v === undefined) throw new Error(`schedule index ${i} out of range`);
	return v;
}

function swapStr(a: string[], i: number, j: number): void {
	const ti = a[i];
	const tj = a[j];
	if (ti === undefined || tj === undefined) return;
	a[i] = tj;
	a[j] = ti;
}

/** Fisher–Yates copy shuffle. */
export function shuffleHandles(handles: string[], random: () => number = defaultRandom): string[] {
	const a = handles.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		swapStr(a, i, j);
	}
	return a;
}

/**
 * Build a start-time schedule for one refresh epoch.
 * - Spreads starts across [startMs, startMs+epochMs)
 * - Enforces minGap between consecutive starts
 * - If N*minGap > epochMs, expands epoch (epochExpanded=true)
 */
export function buildRefreshSchedule(input: BuildRefreshScheduleInput): BuildRefreshScheduleResult {
	const epochMsIn = Math.max(1, Math.floor(input.epochMs ?? DEFAULT_SPREAD_WINDOW_MS));
	const minGapMs = Math.max(0, Math.floor(input.minGapMs ?? DEFAULT_MIN_GAP_MS));
	const jitterRatio = input.jitterRatio ?? DEFAULT_JITTER_RATIO;
	const maxJitterMs = Math.max(0, Math.floor(input.maxJitterMs ?? DEFAULT_MAX_JITTER_MS));
	const random = input.random ?? defaultRandom;
	const doShuffle = input.shuffle !== false;

	const unique = [...new Set(input.handles.map((h) => h.trim()).filter(Boolean))];
	const order = doShuffle ? shuffleHandles(unique, random) : unique;
	const n = order.length;

	if (n === 0) {
		return {
			slots: [],
			epochMs: epochMsIn,
			minGapMs,
			idealSlotMs: epochMsIn,
			epochExpanded: false,
			order: [],
		};
	}

	const minEpoch = n <= 1 ? epochMsIn : (n - 1) * minGapMs;
	const epochExpanded = minEpoch > epochMsIn;
	const epochMs = epochExpanded ? minEpoch : epochMsIn;
	const idealSlotMs = n <= 1 ? epochMs : epochMs / n;

	const rawTimes: number[] = [];
	for (let i = 0; i < n; i++) {
		const base = input.startMs + i * idealSlotMs;
		const jitterAmp = Math.min(maxJitterMs, idealSlotMs * jitterRatio);
		const jitter = n === 1 ? 0 : (random() * 2 - 1) * jitterAmp;
		rawTimes.push(base + jitter);
	}
	rawTimes.sort((a, b) => a - b);

	// Enforce minGap; keep within [start, start+epoch] when possible
	const endMs = input.startMs + epochMs;
	const at: number[] = [];
	for (let i = 0; i < n; i++) {
		let t = atIndex(rawTimes, i);
		if (i === 0) {
			t = Math.max(input.startMs, Math.min(t, endMs));
		} else {
			const prev = atIndex(at, i - 1);
			t = Math.max(t, prev + minGapMs);
		}
		at.push(t);
	}

	// If we overshot end because of minGap chain, lay out from start with minGap
	// (epoch was already expanded so (n-1)*minGap <= epochMs).
	if (n > 1 && atIndex(at, n - 1) > endMs) {
		for (let i = 0; i < n; i++) {
			at[i] = input.startMs + i * minGapMs;
		}
	}

	const slots: ScheduleSlot[] = order.map((handle, index) => ({
		handle,
		atMs: Math.round(atIndex(at, index)),
		index,
	}));

	return {
		slots,
		epochMs,
		minGapMs,
		idealSlotMs,
		epochExpanded,
		order,
	};
}

/**
 * Pause after 429 when headers are unavailable.
 * Prefers a random band; never exceeds remaining epoch (+ small slack).
 */
export function rateLimitPauseMs(input: {
	nowMs: number;
	epochEndMs: number;
	minMs?: number;
	maxMs?: number;
	random?: () => number;
}): number {
	const random = input.random ?? defaultRandom;
	const minMs = input.minMs ?? DEFAULT_429_PAUSE_MIN_MS;
	const maxMs = Math.max(minMs, input.maxMs ?? DEFAULT_429_PAUSE_MAX_MS);
	const band = minMs + random() * (maxMs - minMs);
	const remaining = Math.max(0, input.epochEndMs - input.nowMs);
	// Leave at least a little room; if almost no time left, still pause min(band, 60s)
	if (remaining <= 0) return Math.min(band, 60_000);
	return Math.round(Math.min(band, remaining));
}

/**
 * Re-insert a failed handle later in the remaining epoch (after a pause).
 * Drops the handle if there is no room past `notBeforeMs` with minGap.
 */
export function deferHandleInSchedule(input: {
	remaining: ScheduleSlot[];
	handle: string;
	notBeforeMs: number;
	minGapMs: number;
	epochEndMs: number;
}): ScheduleSlot[] {
	const minGap = Math.max(0, input.minGapMs);
	const rest = input.remaining.filter((s) => s.handle !== input.handle);
	let at = input.notBeforeMs;
	// Place after any slot that would violate minGap if we insert before it
	for (const s of rest) {
		if (s.atMs < at + minGap && s.atMs + minGap > at) {
			at = Math.max(at, s.atMs + minGap);
		}
	}
	if (at > input.epochEndMs) {
		return rest; // cannot fit — caller records permanent failure for this epoch
	}
	const next = [...rest, { handle: input.handle, atMs: Math.round(at), index: -1 }];
	next.sort((a, b) => a.atMs - b.atMs || a.handle.localeCompare(b.handle));
	return next.map((s, index) => ({ ...s, index }));
}

/**
 * Future incremental hook: which handles to include in this epoch.
 * `full` = all; `incremental` = only those missing from done or older than maxAgeMs.
 */
export function selectHandlesForEpoch(input: {
	allHandles: string[];
	mode: "full" | "incremental";
	/** handle → last successful fetch ms */
	lastSuccessMs?: Record<string, number>;
	/** Refresh if last success older than this (default 55min — under 60min epoch). */
	maxAgeMs?: number;
	nowMs?: number;
}): string[] {
	const all = [...new Set(input.allHandles.map((h) => h.trim()).filter(Boolean))];
	if (input.mode === "full") return all;
	const now = input.nowMs ?? Date.now();
	const maxAge = input.maxAgeMs ?? 55 * 60_000;
	const last = input.lastSuccessMs ?? Object.create(null);
	return all.filter((h) => {
		if (!Object.hasOwn(last, h)) return true;
		const t = last[h];
		if (typeof t !== "number" || !Number.isFinite(t)) return true;
		return now - t >= maxAge;
	});
}

/**
 * After a long 429 pause, pending slots may all sit in the past — starting them
 * back-to-back would violate minGap. Shift the queue so the first start is
 * >= nowMs and consecutive gaps stay >= minGapMs.
 */
export function rebaseScheduleQueue(input: {
	queue: ScheduleSlot[];
	nowMs: number;
	minGapMs: number;
	epochEndMs: number;
}): ScheduleSlot[] {
	const minGap = Math.max(0, input.minGapMs);
	if (!input.queue.length) return [];
	const out: ScheduleSlot[] = [];
	let prevAt = input.nowMs - minGap;
	for (const s of input.queue) {
		const at = Math.max(s.atMs, prevAt + minGap, input.nowMs);
		if (at > input.epochEndMs) {
			// Drop slots that can no longer start inside the epoch
			continue;
		}
		out.push({ handle: s.handle, atMs: Math.round(at), index: -1 });
		prevAt = at;
	}
	return out.map((s, index) => ({ ...s, index }));
}
