import { describe, expect, test, vi } from "vitest";
import { createDashboardVm } from "./dashboard-vm";

const data = {
	watchlistCount: 2,
	groupCount: 1,
	memberCount: 3,
	items24h: 4,
	pendingAi: 5,
	bySourceType: [{ sourceType: "x.com", count: 4 }],
	itemsTrend: [{ date: "2026-08-23", count: 4 }],
	ingestTrend: [{ date: "2026-08-23", accepted: 2, deduped: 1, rejected: 0 }],
	recentIngestLogs: [],
};

describe("createDashboardVm", () => {
	test("load + cards", async () => {
		const vm = createDashboardVm({ fetchDashboard: vi.fn().mockResolvedValue(data) });
		await vm.load();
		expect(vm.getState().data).toEqual(data);
		expect(vm.cards()).toEqual([
			{ label: "Watchlists", value: 2 },
			{ label: "Groups", value: 1 },
			{ label: "Members", value: 3 },
			{ label: "Items (24h)", value: 4 },
			{ label: "Pending AI", value: 5 },
		]);
	});

	test("load error", async () => {
		const vm = createDashboardVm({
			fetchDashboard: vi.fn().mockRejectedValue(new Error("down")),
		});
		await vm.load();
		expect(vm.getState().error).toBe("down");
		expect(vm.cards()).toEqual([]);
	});
});
