import type { ReactNode } from "react";
import { chunkFeedPages, feedColumnsItemClassName, feedColumnsPageStyle } from "@/lib/feed-columns";
import { cn } from "@/lib/utils";

export function PostsColumnsPages<T extends { id: number }>({
	items,
	columnCount,
	renderItem,
}: {
	items: T[];
	columnCount: number;
	renderItem: (item: T) => ReactNode;
}) {
	return (
		<>
			{chunkFeedPages(items).map((page) => (
				<div
					key={page[0]?.id ?? "empty"}
					data-testid="posts-columns-page"
					style={feedColumnsPageStyle(columnCount)}
				>
					{page.map((item) => renderItem(item))}
				</div>
			))}
		</>
	);
}

export function postsColumnsItemClass(extra?: string): string {
	return cn(feedColumnsItemClassName, extra);
}
