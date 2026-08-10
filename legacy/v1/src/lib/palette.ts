// Centralized chart / visualization color palette.
// All values reference CSS custom properties defined in globals.css.

/** Helper — wraps a CSS custom property name for inline style usage. */
const v = (token: string) => `hsl(var(--${token}))`;

/**
 * Returns a CSS color string with alpha from a CSS custom property.
 * Usage: `withAlpha("chart-1", 0.12)` → `hsl(var(--chart-1) / 0.12)`
 */
export const withAlpha = (token: string, alpha: number) =>
  `hsl(var(--${token}) / ${alpha})`;

// ── 10 sequential chart colors (sufficient for endpoint breakdown) ──

export const chart = {
  indigo:  v("chart-1"),  // Brand indigo-blue (= --primary)
  sky:     v("chart-2"),
  teal:    v("chart-3"),
  jade:    v("chart-4"),
  green:   v("chart-5"),
  lime:    v("chart-6"),
  amber:   v("chart-7"),
  orange:  v("chart-8"),
  blue:    v("chart-9"),
  red:     v("chart-10"),
} as const;

/** Ordered array — use for pie / donut / bar where you need N colors by index. */
export const CHART_COLORS = Object.values(chart);

// ── Semantic aliases ──

export const chartAxis = v("chart-axis");
export const chartMuted = v("chart-muted");
