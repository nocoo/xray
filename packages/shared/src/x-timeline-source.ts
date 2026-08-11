import type { CanonicalItem } from "./canonical-item.js";

/**
 * Minimal boundary between X-Ray producer orchestration and any external X reader.
 *
 * Replace twitter-cli by implementing this interface; orchestrator must not
 * import vendor field names (screenName, createdAtISO, …) or vendor CLIs.
 *
 * Data crossing the boundary:
 * - in:  handle (normalized x.com username), max count hint
 * - out: CanonicalItem[] (already parseCanonicalItem-valid)
 * - side: opaque `raw` blob for disk cache only (vendor-owned; never POSTed)
 */
export type TimelineSkip = { index: number; reason: string };

export type TimelineFetchResult = {
	/** Canonical items ready for window filter + ingest. */
	items: CanonicalItem[];
	/** Rows dropped by the adapter mapper (not ingest). */
	skipped: TimelineSkip[];
	/**
	 * Vendor-native payload for caching. Orchestrator treats as opaque JSON.
	 * Must round-trip through `parseCachedRaw`.
	 */
	raw: unknown;
};

export type XTimelineSource = {
	/** Cache namespace / meta.producer, e.g. "twitter-cli". */
	readonly id: string;

	/** Preflight: binary present + session valid. Throws operator-facing Error. */
	ready(): Promise<void>;

	/** Live fetch one handle (may hit network). */
	fetchHandle(handle: string): Promise<TimelineFetchResult>;

	/** Rehydrate from opaque cache without network. */
	parseCachedRaw(raw: unknown): TimelineFetchResult;
};
