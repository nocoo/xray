import type { CanonicalItem } from "./canonical-item.js";

/** Max items per POST /api/v1/ingest/push (server contract). */
export const INGEST_MAX_ITEMS = 50;

export type IngestPushBody = {
	watchlist_id: number;
	items: CanonicalItem[];
	options?: { apply_window_hours?: number };
};

/** Keep items whose created_at is within the last `windowHours` (and not >5m future). */
export function filterItemsByWindow(
	items: CanonicalItem[],
	windowHours: number,
	nowMs: number = Date.now(),
): { kept: CanonicalItem[]; dropped: number } {
	const windowMs = windowHours * 3600_000;
	const futureSkew = 5 * 60_000;
	const kept: CanonicalItem[] = [];
	let dropped = 0;
	for (const it of items) {
		const ms = Date.parse(it.created_at);
		if (!Number.isFinite(ms) || ms > nowMs + futureSkew || nowMs - ms > windowMs) {
			dropped += 1;
			continue;
		}
		kept.push(it);
	}
	return { kept, dropped };
}

/** Chunk items into ingest bodies of ≤ INGEST_MAX_ITEMS. */
export function buildIngestBatches(
	watchlistId: number,
	items: CanonicalItem[],
	options?: { apply_window_hours?: number },
): IngestPushBody[] {
	if (items.length === 0) return [];
	const batches: IngestPushBody[] = [];
	for (let i = 0; i < items.length; i += INGEST_MAX_ITEMS) {
		const chunk = items.slice(i, i + INGEST_MAX_ITEMS);
		const body: IngestPushBody = { watchlist_id: watchlistId, items: chunk };
		if (options?.apply_window_hours !== undefined) {
			body.options = { apply_window_hours: options.apply_window_hours };
		}
		batches.push(body);
	}
	return batches;
}
