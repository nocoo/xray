import { describe, expect, test } from "vitest";
import { CHART_COLORS, chartAxis, withAlpha } from "./chart-palette";

describe("chart-palette", () => {
	test("tokens resolve to hsl custom properties", () => {
		expect(withAlpha("chart-1", 0.2)).toBe("hsl(var(--chart-1) / 0.2)");
		expect(chartAxis).toBe("hsl(var(--chart-axis))");
		expect(CHART_COLORS).toHaveLength(10);
		expect(CHART_COLORS[0]).toBe("hsl(var(--chart-1))");
		expect(CHART_COLORS[4]).toBe("hsl(var(--chart-5))");
	});
});
