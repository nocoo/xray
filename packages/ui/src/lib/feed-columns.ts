export const ITEMS_PAGE_LIMIT = 50;

export function distributeColumns<T>(
	items: T[],
	columnCount: number,
	estimateHeight: (item: T) => number,
): T[][] {
	const n = Math.max(1, Number.isFinite(columnCount) ? Math.trunc(columnCount) : 1);
	const cols: T[][] = Array.from({ length: n }, () => []);
	const heights = new Array<number>(n).fill(0);
	for (const item of items) {
		let minIdx = 0;
		for (let c = 1; c < n; c++) {
			if (heights[c] < heights[minIdx]) minIdx = c;
		}
		cols[minIdx].push(item);
		heights[minIdx] += Math.max(0, estimateHeight(item));
	}
	return cols;
}

export function resolveItemHeight<T extends { id: number }>(
	item: T,
	estimateHeight: (item: T) => number,
	measured: Readonly<Record<number, number>>,
): number {
	const h = measured[item.id];
	return h != null ? h : estimateHeight(item);
}

export function applyMeasuredHeights(
	prev: Readonly<Record<number, number>>,
	incoming: Iterable<readonly [number, number]>,
): Record<number, number> | null {
	let changed = false;
	const next = { ...prev };
	for (const [id, raw] of incoming) {
		const h = Math.round(raw);
		if (h <= 0 || next[id] === h) continue;
		next[id] = h;
		changed = true;
	}
	return changed ? next : null;
}

export function pruneMeasuredHeights(
	prev: Readonly<Record<number, number>>,
	keep: ReadonlySet<number>,
): Record<number, number> {
	let changed = false;
	const next: Record<number, number> = {};
	for (const key of Object.keys(prev)) {
		const id = Number(key);
		const h = prev[id];
		if (h == null || !keep.has(id)) {
			changed = true;
			continue;
		}
		next[id] = h;
	}
	return changed ? next : prev;
}
