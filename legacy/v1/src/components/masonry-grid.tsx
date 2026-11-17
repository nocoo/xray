"use client";

import { useMemo } from "react";
import { useColumns } from "@/hooks/use-columns";

// =============================================================================
// MasonryGrid — responsive masonry layout using shortest-column algorithm
// =============================================================================

export interface MasonryGridProps<T> {
  items: T[];
  /** Unique key for each item */
  keyExtractor: (item: T) => string | number;
  /** Estimate card height for column balancing (doesn't need to be exact) */
  estimateHeight: (item: T) => number;
  /** Render a single item */
  renderItem: (item: T) => React.ReactNode;
  /** Gap between columns and rows (Tailwind class), default "gap-3" */
  gap?: string;
}

export function MasonryGrid<T>({
  items,
  keyExtractor,
  estimateHeight,
  renderItem,
  gap = "gap-3",
}: MasonryGridProps<T>) {
  const columnCount = useColumns();

  const columns = useMemo(() => {
    const cols: T[][] = Array.from({ length: columnCount }, () => []);
    const heights = new Array<number>(columnCount).fill(0);

    for (const item of items) {
      const h = estimateHeight(item);

      // Find shortest column
      let minIdx = 0;
      for (let c = 1; c < columnCount; c++) {
        if ((heights[c] ?? 0) < (heights[minIdx] ?? 0)) minIdx = c;
      }
      cols[minIdx]?.push(item);
      heights[minIdx] = (heights[minIdx] ?? 0) + h;
    }

    return cols;
  }, [items, columnCount, estimateHeight]);

  return (
    <div className={`flex items-start ${gap}`}>
      {columns.map((col, colIdx) => (
        <div key={colIdx} className={`flex-1 min-w-0 flex flex-col ${gap}`}>
          {col.map((item) => (
            <div key={keyExtractor(item)}>{renderItem(item)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
