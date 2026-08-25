import { Fragment, type ReactNode, useMemo } from "react";
import { distributeColumns } from "@/lib/feed-columns";

export function PostsColumnsPages<T extends { id: number }>({
	items,
	columnCount,
	estimateHeight,
	renderItem,
}: {
	items: T[];
	columnCount: number;
	estimateHeight: (item: T) => number;
	renderItem: (item: T) => ReactNode;
}) {
	const columns = useMemo(
		() => distributeColumns(items, columnCount, estimateHeight),
		[items, columnCount, estimateHeight],
	);
	return (
		<div className="flex items-start gap-3" data-testid="posts-masonry">
			{columns.map((col, colIdx) => (
				<div
					key={col[0] ? `slot-${colIdx}-${col[0].id}` : `slot-${colIdx}`}
					data-testid="posts-masonry-col"
					className="flex min-w-0 flex-1 flex-col gap-3"
				>
					{col.map((item) => (
						<Fragment key={item.id}>{renderItem(item)}</Fragment>
					))}
				</div>
			))}
		</div>
	);
}
