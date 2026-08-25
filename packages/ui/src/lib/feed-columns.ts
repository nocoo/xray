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
