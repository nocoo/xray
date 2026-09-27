import type { DashboardAggregates } from "@xray/shared";
import { describe, expect, test, vi } from "vitest";
import { createDashboardVm } from "./dashboard-vm";

const data: DashboardAggregates = {
	watchlistCount: 2,
	channelCount: 3,
	groupCount: 1,
	memberCount: 3,
	contentCount: 12,
	content24h: 6,
	pendingAi: 5,
	contentTrend: [
		{ date: "2026-09-26", watchlists: 2, channels: 4 },
		{ date: "2026-09-27", watchlists: 1, channels: 5 },
	],
	recentIngestLogs: [],
};

describe("createDashboardVm", () => {
	test("includes both categories in overview and reconciles chart totals", async () => {
		const vm = createDashboardVm({ fetchDashboard: vi.fn().mockResolvedValue(data) });
		await vm.load();
		expect(vm.getState()).toEqual({ data, loading: false, error: null });
		expect(vm.cards().map(({ label, value }) => ({ label, value }))).toEqual([
			{ label: "Total content", value: 12 },
			{ label: "Added (24h)", value: 6 },
			{ label: "Watchlists", value: 2 },
			{ label: "Channels", value: 3 },
		]);
		expect(vm.cards()[2]?.subtitle).toBe("Groups 1 · Members 3");
		expect(vm.activity()).toEqual({
			points: [
				{ x: "2026-09-26", watchlists: 2, channels: 4 },
				{ x: "2026-09-27", watchlists: 1, channels: 5 },
			],
			watchlists: 3,
			channels: 9,
			total: 12,
		});
	});

	test("empty data and failed loads have no fabricated counts", async () => {
		const vm = createDashboardVm({ fetchDashboard: vi.fn().mockRejectedValue(new Error("down")) });
		const pending = vm.load();
		expect(vm.getState().loading).toBe(true);
		await pending;
		expect(vm.getState().error).toBe("down");
		expect(vm.cards()).toEqual([]);
		expect(vm.activity()).toEqual({ points: [], watchlists: 0, channels: 0, total: 0 });
	});

	test("channel-only data and recovery preserve zero watchlist values", async () => {
		const channelOnly = {
			...data,
			watchlistCount: 0,
			contentTrend: [{ date: "2026-09-27", watchlists: 0, channels: 2 }],
		};
		const api = {
			fetchDashboard: vi.fn().mockRejectedValueOnce("offline").mockResolvedValue(channelOnly),
		};
		const vm = createDashboardVm(api);
		await vm.load();
		expect(vm.getState().error).toBe("offline");
		await vm.load();
		expect(vm.getState().error).toBeNull();
		expect(vm.activity()).toMatchObject({ watchlists: 0, channels: 2, total: 2 });
		expect(vm.cards()[2]?.value).toBe(0);
	});
});
