import { describe, expect, test, vi } from "vitest";
import { createWatchlistsVm } from "./watchlists-vm";

const sample = {
	id: 1,
	name: "Alpha",
	description: null,
	icon: "eye",
	translateEnabled: false,
	createdAtMs: 1,
	memberCount: 0,
};

describe("createWatchlistsVm", () => {
	test("load success sets watchlists", async () => {
		const fetchWatchlists = vi.fn().mockResolvedValue([sample]);
		const vm = createWatchlistsVm({ fetchWatchlists });
		await vm.load();
		expect(vm.getState().watchlists).toEqual([sample]);
		expect(vm.getState().loading).toBe(false);
		expect(vm.getState().error).toBeNull();
		expect(fetchWatchlists).toHaveBeenCalledOnce();
	});

	test("load failure sets error", async () => {
		const vm = createWatchlistsVm({
			fetchWatchlists: vi.fn().mockRejectedValue(new Error("boom")),
		});
		await vm.load();
		expect(vm.getState().error).toBe("boom");
		expect(vm.getState().loading).toBe(false);
	});
});
