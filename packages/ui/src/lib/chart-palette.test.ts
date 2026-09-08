import { describe, expect, test } from "vitest";
import { CHART_COLORS, chartAxis, withAlpha } from "./chart-palette";

describe("chart-palette", () => {
	test("reuses Basalt's distinct five-color cycle", () => {
		expect(withAlpha("chart-1", 0.2)).toBe("hsl(var(--basalt-chart-1) / 0.2)");
		expect(chartAxis).toBe("hsl(var(--basalt-chart-axis))");
		expect(CHART_COLORS).toHaveLength(5);
		expect(new Set(CHART_COLORS).size).toBe(5);
		expect(CHART_COLORS[0]).not.toBe(CHART_COLORS[1]);
	});
});
