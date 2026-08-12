import { useSyncExternalStore } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
let nowMs = Date.now();
let intervalId: number | null = null;
let intervalMs = 30_000;

function emit() {
	nowMs = Date.now();
	for (const l of listeners) l();
}

function start() {
	if (intervalId != null || typeof window === "undefined") return;
	// Refresh immediately so a remount after idle does not show a frozen clock.
	nowMs = Date.now();
	intervalId = window.setInterval(emit, intervalMs);
}

function stop() {
	if (intervalId == null || typeof window === "undefined") return;
	window.clearInterval(intervalId);
	intervalId = null;
}

function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	if (listeners.size === 1) start();
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) stop();
	};
}

function getSnapshot(): number {
	return nowMs;
}

function getServerSnapshot(): number {
	return nowMs;
}

/**
 * Shared wall-clock tick (one interval for the whole page).
 * Relative timestamps (post time → now) stay fresh without N timers per card.
 */
export function useNow(_intervalMs = 30_000): number {
	// Interval is global; first subscriber wins. Arg kept for call-site compatibility.
	if (_intervalMs > 0 && _intervalMs !== intervalMs && listeners.size === 0) {
		intervalMs = _intervalMs;
	}
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test helper — advance the shared clock without waiting on the interval. */
export function __tickNowForTests(ms = Date.now()): void {
	nowMs = ms;
	for (const l of listeners) l();
}
