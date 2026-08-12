import { describe, expect, test } from "vitest";
import {
	buildRefreshSchedule,
	DEFAULT_MIN_GAP_MS,
	DEFAULT_SPREAD_WINDOW_MS,
	deferHandleInSchedule,
	rateLimitPauseMs,
	rebaseScheduleQueue,
	selectHandlesForEpoch,
	shuffleHandles,
} from "./producer-schedule.js";

/** Deterministic LCG */
function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(1664525, s) + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

describe("buildRefreshSchedule", () => {
	test("empty", () => {
		const r = buildRefreshSchedule({ handles: [], startMs: 1_000_000 });
		expect(r.slots).toEqual([]);
		expect(r.epochMs).toBe(DEFAULT_SPREAD_WINDOW_MS);
	});

	test("single handle starts at startMs band", () => {
		const r = buildRefreshSchedule({
			handles: ["a"],
			startMs: 1_000_000,
			epochMs: 60_000,
			shuffle: false,
			random: () => 0.5,
		});
		expect(r.slots).toHaveLength(1);
		const first = r.slots[0];
		expect(first?.handle).toBe("a");
		expect(first?.atMs).toBeGreaterThanOrEqual(1_000_000);
		expect(first?.atMs).toBeLessThanOrEqual(1_000_000 + 60_000);
	});

	test("48 handles fit 60min with min gap", () => {
		const handles = Array.from({ length: 48 }, (_, i) => `h${i}`);
		const start = 1_700_000_000_000;
		const r = buildRefreshSchedule({
			handles,
			startMs: start,
			epochMs: DEFAULT_SPREAD_WINDOW_MS,
			minGapMs: DEFAULT_MIN_GAP_MS,
			shuffle: true,
			random: lcg(42),
		});
		expect(r.slots).toHaveLength(48);
		expect(r.epochExpanded).toBe(false);
		for (let i = 1; i < r.slots.length; i++) {
			const cur = r.slots[i];
			const prev = r.slots[i - 1];
			expect(cur && prev).toBeTruthy();
			if (!cur || !prev) continue;
			expect(cur.atMs - prev.atMs).toBeGreaterThanOrEqual(DEFAULT_MIN_GAP_MS);
		}
		const last = r.slots[r.slots.length - 1];
		const first = r.slots[0];
		expect(last && first).toBeTruthy();
		if (last && first) {
			expect(last.atMs - first.atMs).toBeLessThanOrEqual(DEFAULT_SPREAD_WINDOW_MS);
		}
		expect(new Set(r.order).size).toBe(48);
	});

	test("expands epoch when minGap cannot fit", () => {
		const r = buildRefreshSchedule({
			handles: ["a", "b", "c"],
			startMs: 0,
			epochMs: 10_000,
			minGapMs: 10_000,
			shuffle: false,
			random: () => 0.5,
		});
		expect(r.epochExpanded).toBe(true);
		expect(r.epochMs).toBe(20_000);
		const a = r.slots[0];
		const b = r.slots[1];
		expect(a && b).toBeTruthy();
		if (a && b) expect(b.atMs - a.atMs).toBeGreaterThanOrEqual(10_000);
	});

	test("dedupes handles", () => {
		const r = buildRefreshSchedule({
			handles: ["a", "a", "b"],
			startMs: 0,
			epochMs: 60_000,
			minGapMs: 1000,
			shuffle: false,
			random: () => 0.5,
		});
		expect(r.slots.map((s) => s.handle).sort()).toEqual(["a", "b"]);
	});
});

describe("rateLimitPauseMs", () => {
	test("within band and remaining", () => {
		const p = rateLimitPauseMs({
			nowMs: 0,
			epochEndMs: 600_000,
			minMs: 100_000,
			maxMs: 200_000,
			random: () => 0.5,
		});
		expect(p).toBe(150_000);
	});

	test("capped by remaining epoch", () => {
		const p = rateLimitPauseMs({
			nowMs: 550_000,
			epochEndMs: 600_000,
			minMs: 120_000,
			maxMs: 300_000,
			random: () => 0,
		});
		expect(p).toBe(50_000);
	});
});

describe("deferHandleInSchedule", () => {
	test("reinserts after notBefore with minGap", () => {
		const remaining = [
			{ handle: "b", atMs: 100_000, index: 0 },
			{ handle: "c", atMs: 200_000, index: 1 },
		];
		const next = deferHandleInSchedule({
			remaining,
			handle: "a",
			notBeforeMs: 150_000,
			minGapMs: 12_000,
			epochEndMs: 500_000,
		});
		expect(next.map((s) => s.handle)).toContain("a");
		const a = next.find((s) => s.handle === "a");
		expect(a?.atMs).toBeGreaterThanOrEqual(150_000);
	});

	test("drops when past epoch end", () => {
		const next = deferHandleInSchedule({
			remaining: [{ handle: "b", atMs: 100, index: 0 }],
			handle: "a",
			notBeforeMs: 999_999,
			minGapMs: 12_000,
			epochEndMs: 500_000,
		});
		expect(next.map((s) => s.handle)).toEqual(["b"]);
	});
});

describe("selectHandlesForEpoch", () => {
	test("full returns all", () => {
		expect(selectHandlesForEpoch({ allHandles: ["a", "b"], mode: "full" })).toEqual(["a", "b"]);
	});

	test("incremental skips fresh successes", () => {
		const now = 1_000_000;
		const got = selectHandlesForEpoch({
			allHandles: ["a", "b", "c"],
			mode: "incremental",
			nowMs: now,
			maxAgeMs: 100_000,
			lastSuccessMs: { a: now - 10_000, b: now - 200_000 },
		});
		expect(got.sort()).toEqual(["b", "c"]);
	});
});

describe("shuffleHandles", () => {
	test("permutation of input", () => {
		const h = ["a", "b", "c", "d"];
		const s = shuffleHandles(h, lcg(7));
		expect([...s].sort()).toEqual([...h].sort());
		expect(s).not.toBe(h);
	});
});

describe("buildRefreshSchedule edge branches", () => {
	test("uses default random and defaults when omitted", () => {
		const r = buildRefreshSchedule({
			handles: ["x", "y"],
			startMs: Date.now(),
		});
		expect(r.slots).toHaveLength(2);
		expect(r.minGapMs).toBe(DEFAULT_MIN_GAP_MS);
	});

	test("pull-back path when jitter pushes past end", () => {
		// Force large positive jitter then minGap so last overshoots
		let n = 0;
		const r = buildRefreshSchedule({
			handles: ["a", "b", "c", "d"],
			startMs: 0,
			epochMs: 30_000,
			minGapMs: 5_000,
			maxJitterMs: 50_000,
			jitterRatio: 1,
			shuffle: false,
			random: () => {
				// alternate high/low to create unsorted then overshoot
				n += 1;
				return n % 2 === 0 ? 0.99 : 0.01;
			},
		});
		expect(r.slots).toHaveLength(4);
		const times = r.slots.map((s) => s.atMs);
		for (let i = 1; i < times.length; i++) {
			const cur = times[i];
			const prev = times[i - 1];
			if (cur === undefined || prev === undefined) continue;
			expect(cur - prev).toBeGreaterThanOrEqual(5_000);
		}
	});

	test("rateLimitPause when epoch already ended", () => {
		const p = rateLimitPauseMs({
			nowMs: 1_000_000,
			epochEndMs: 500_000,
			minMs: 120_000,
			maxMs: 300_000,
			random: () => 0.5,
		});
		expect(p).toBe(0);
	});

	test("incremental default maxAge", () => {
		const now = Date.now();
		const got = selectHandlesForEpoch({
			allHandles: ["fresh", "stale"],
			mode: "incremental",
			nowMs: now,
			lastSuccessMs: {
				fresh: now - 60_000,
				stale: now - 60 * 60_000,
			},
		});
		expect(got).toContain("stale");
		expect(got).not.toContain("fresh");
	});

	test("defer places after colliding slot", () => {
		const next = deferHandleInSchedule({
			remaining: [
				{ handle: "b", atMs: 160_000, index: 0 },
				{ handle: "c", atMs: 300_000, index: 1 },
			],
			handle: "a",
			notBeforeMs: 155_000,
			minGapMs: 12_000,
			epochEndMs: 400_000,
		});
		const a = next.find((s) => s.handle === "a");
		expect(a?.atMs).toBeGreaterThanOrEqual(160_000 + 12_000);
	});

	test("filters blank handles and shuffle false", () => {
		const r = buildRefreshSchedule({
			handles: [" a ", "", "  ", "b"],
			startMs: 0,
			epochMs: 60_000,
			minGapMs: 1000,
			shuffle: false,
			random: () => 0.5,
		});
		expect(r.order).toEqual(["a", "b"]);
	});

	test("rateLimitPause default min/max band", () => {
		const p = rateLimitPauseMs({
			nowMs: 0,
			epochEndMs: 10_000_000,
			random: () => 0,
		});
		expect(p).toBe(120_000);
	});

	test("selectHandles trims blanks", () => {
		expect(selectHandlesForEpoch({ allHandles: [" a ", ""], mode: "full" })).toEqual(["a"]);
	});

	test("incremental ignores prototype keys on lastSuccess map", () => {
		const now = 1_000_000;
		const got = selectHandlesForEpoch({
			allHandles: ["constructor", "toString", "normal"],
			mode: "incremental",
			nowMs: now,
			maxAgeMs: 100_000,
			lastSuccessMs: {},
		});
		expect(got.sort()).toEqual(["constructor", "normal", "toString"]);
	});

	test("rebaseScheduleQueue enforces minGap after pause", () => {
		const { queue: q, dropped } = rebaseScheduleQueue({
			queue: [
				{ handle: "a", atMs: 100, index: 0 },
				{ handle: "b", atMs: 200, index: 1 },
				{ handle: "c", atMs: 300, index: 2 },
			],
			nowMs: 10_000,
			minGapMs: 5_000,
			epochEndMs: 100_000,
		});
		expect(dropped).toEqual([]);
		expect(q[0]?.atMs).toBeGreaterThanOrEqual(10_000);
		const a = q[0];
		const b = q[1];
		if (a && b) expect(b.atMs - a.atMs).toBeGreaterThanOrEqual(5_000);
	});

	test("rebase drops slots past epoch end", () => {
		const { queue: q, dropped } = rebaseScheduleQueue({
			queue: [
				{ handle: "a", atMs: 100, index: 0 },
				{ handle: "b", atMs: 200, index: 1 },
			],
			nowMs: 50_000,
			minGapMs: 10_000,
			epochEndMs: 55_000,
		});
		// a at 50k ok; b would need 60k > 55k → drop
		expect(q.map((s) => s.handle)).toEqual(["a"]);
		expect(dropped).toEqual(["b"]);
	});

	test("rebase empty queue", () => {
		expect(rebaseScheduleQueue({ queue: [], nowMs: 0, minGapMs: 1000, epochEndMs: 1000 })).toEqual({
			queue: [],
			dropped: [],
		});
	});
});
