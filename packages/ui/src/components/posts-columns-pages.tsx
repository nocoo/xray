import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	applyMeasuredHeights,
	distributeColumns,
	pruneMeasuredHeights,
	resolveItemHeight,
} from "@/lib/feed-columns";

const SETTLE_MS = 180;

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
	const [measured, setMeasured] = useState<Record<number, number>>({});
	const measuredRef = useRef(measured);
	measuredRef.current = measured;
	const pending = useRef(new Map<number, number>());
	const settleTimer = useRef<number | null>(null);
	const observer = useRef<ResizeObserver | null>(null);
	const idByEl = useRef(new WeakMap<Element, number>());
	const elById = useRef(new Map<number, Element>());

	const itemIds = useMemo(() => items.map((it) => it.id), [items]);

	useEffect(() => {
		setMeasured((prev) => pruneMeasuredHeights(prev, new Set(itemIds)));
	}, [itemIds]);

	const flush = useCallback(() => {
		const next = applyMeasuredHeights(measuredRef.current, pending.current);
		pending.current.clear();
		if (next) setMeasured(next);
	}, []);

	const getObserver = useCallback(() => {
		if (observer.current) return observer.current;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const id = idByEl.current.get(entry.target);
				if (id == null) continue;
				pending.current.set(id, entry.contentRect.height);
			}
			if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
			settleTimer.current = window.setTimeout(() => {
				settleTimer.current = null;
				flush();
			}, SETTLE_MS);
		});
		observer.current = ro;
		return ro;
	}, [flush]);

	useEffect(() => {
		return () => {
			observer.current?.disconnect();
			observer.current = null;
			if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
		};
	}, []);

	const bindCard = useCallback(
		(id: number, el: HTMLDivElement | null) => {
			const ro = getObserver();
			const prev = elById.current.get(id);
			if (prev && prev !== el) {
				ro.unobserve(prev);
				elById.current.delete(id);
			}
			if (!el) return;
			elById.current.set(id, el);
			idByEl.current.set(el, id);
			ro.observe(el);
		},
		[getObserver],
	);

	const heightOf = useCallback(
		(item: T) => resolveItemHeight(item, estimateHeight, measured),
		[estimateHeight, measured],
	);
	const columns = useMemo(
		() => distributeColumns(items, columnCount, heightOf),
		[items, columnCount, heightOf],
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
						<div key={item.id} ref={(el) => bindCard(item.id, el)} data-testid="posts-masonry-card">
							{renderItem(item)}
						</div>
					))}
				</div>
			))}
		</div>
	);
}
