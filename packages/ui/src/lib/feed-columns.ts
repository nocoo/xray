/** Fetch + CSS-columns page size. Each page is its own column box so loadMore cannot rebalance older cards. */
export const ITEMS_PAGE_LIMIT = 50;

export function chunkFeedPages<T>(items: T[], pageSize = ITEMS_PAGE_LIMIT): T[][] {
	if (pageSize <= 0) return items.length ? [items] : [];
	const pages: T[][] = [];
	for (let i = 0; i < items.length; i += pageSize) {
		pages.push(items.slice(i, i + pageSize));
	}
	return pages;
}

export function feedColumnsPageStyle(columnCount: number): {
	columnCount: number;
	columnFill: "balance";
	columnGap: string;
} {
	return { columnCount, columnFill: "balance", columnGap: "0.75rem" };
}

export const feedColumnsItemClassName = "mb-3 inline-block w-full break-inside-avoid align-top";
