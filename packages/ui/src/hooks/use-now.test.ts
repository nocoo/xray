import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useNow } from "./use-now";

describe("useNow", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("ticks every interval", () => {
		const { result } = renderHook(() => useNow(1_000));
		const t0 = result.current;
		expect(t0).toBe(Date.parse("2026-08-12T12:00:00.000Z"));
		act(() => {
			vi.advanceTimersByTime(1_000);
		});
		expect(result.current).toBeGreaterThan(t0);
	});
});
