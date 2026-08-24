export const withAlpha = (token: string, alpha: number) => `hsl(var(--${token}) / ${alpha})`;

export const CHART_COLORS = Array.from({ length: 10 }, (_, i) => `hsl(var(--chart-${i + 1}))`);

export const chartAxis = "hsl(var(--chart-axis))";
