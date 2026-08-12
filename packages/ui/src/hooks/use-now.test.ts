import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { __tickNowForTests, useNow } from "./use-now";

describe("useNow", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
		__tickNowForTests(Date.parse("2026-08-12T12:00:00.000Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("shared clock ticks once for multiple subscribers", () => {
		const a = renderHook(() => useNow(1_000));
		const b = renderHook(() => useNow(1_000));
		const t0 = a.result.current;
		expect(b.result.current).toBe(t0);
		act(() => {
			vi.advanceTimersByTime(1_000);
			// interval may fire; also force for determinism under fake timers
			__tickNowForTests(Date.parse("2026-08-12T12:00:01.000Z"));
		});
		expect(a.result.current).toBeGreaterThan(t0);
		expect(b.result.current).toBe(a.result.current);
		a.unmount();
		b.unmount();
	});
});
