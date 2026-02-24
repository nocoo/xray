/**
 * Shared recharts configuration — axis, tooltip, bar radius, responsive container.
 */

import { CHART_COLORS as PALETTE_COLORS, chartAxis, chartMuted } from "./palette";

export { PALETTE_COLORS };

/** Get color from palette by index (wraps around) */
export function getChartColor(index: number): string {
  return PALETTE_COLORS[index % PALETTE_COLORS.length]!;
}

/** Common axis configuration — uses CSS variable tokens */
export const AXIS_CONFIG = {
  tick: { fontSize: 12, fill: chartAxis },
  axisLine: false as const,
  tickLine: false as const,
} as const;

/** Common tooltip styles */
export const TOOLTIP_STYLES = {
  container: "rounded-md border bg-popover px-3 py-2 text-sm shadow-md",
  title: "font-medium",
  value: "text-muted-foreground",
} as const;

/** Common bar radius for rounded corners */
export const BAR_RADIUS = {
  horizontal: [0, 4, 4, 0] as [number, number, number, number],
  vertical: [4, 4, 0, 0] as [number, number, number, number],
} as const;

/** Format number compactly */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

/** Shared ResponsiveContainer props */
export const RESPONSIVE_CONTAINER_PROPS = {
  width: "100%" as const,
  height: "100%" as const,
  minWidth: 0,
  minHeight: 0,
  initialDimension: { width: 1, height: 1 },
  debounce: 300,
} as const;

/** Legend configuration */
export const LEGEND_CONFIG = {
  wrapperStyle: { fontSize: 12 },
} as const;

/** Axis label for muted grid lines */
export { chartAxis, chartMuted };
