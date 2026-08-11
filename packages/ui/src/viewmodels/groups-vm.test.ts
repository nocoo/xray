import { describe, expect, test, vi } from "vitest";
import { createGroupsVm } from "./groups-vm";

const group = {
	id: 1,
	name: "G",
	description: null,
	icon: "users",
	createdAtMs: 1,
	memberCount: 1,
};

const member = {
	id: 10,
	groupId: 1,
	sourceType: "x.com" as const,
	externalAuthorId: null,
	handle: "alice",
	displayName: null,
	addedAtMs: 1,
};

function api(overrides: Partial<Parameters<typeof createGroupsVm>[0]> = {}) {
	return {
		fetchGroups: vi.fn().mockResolvedValue([group]),
		fetchWatchlists: vi.fn().mockResolvedValue([]),
		fetchGroupMembers: vi.fn().mockResolvedValue([member]),
		deleteGroup: vi.fn().mockResolvedValue({ deleted: true }),
		updateGroup: vi.fn().mockResolvedValue(group),
		deleteGroupMember: vi.fn().mockResolvedValue({ deleted: true }),
		bulkImportGroupMembers: vi.fn().mockResolvedValue({ added: 2, skipped: 1, total: 3 }),
		copyGroupToWatchlist: vi.fn().mockResolvedValue({ added: 1, skipped: 0, total: 1 }),
		...overrides,
	};
}

describe("createGroupsVm", () => {
	test("load select import copy", async () => {
		const a = api();
		const vm = createGroupsVm(a, 1);
		await vm.load();
		expect(vm.getState().groups).toHaveLength(1);
		await vm.loadMembers(1);
		expect(vm.getState().members).toEqual([member]);
		vm.setImportText("@bob\n@carol");
		await vm.importMembers();
		expect(a.bulkImportGroupMembers).toHaveBeenCalledWith(1, "@bob\n@carol");
		expect(vm.getState().importInfo).toContain("Imported 2");
		vm.setCopyWlId(5);
		await vm.copyToWatchlist();
		expect(a.copyGroupToWatchlist).toHaveBeenCalledWith(1, { watchlistId: 5 });
	});

	test("delete group clears selection", async () => {
		const a = api();
		const vm = createGroupsVm(a, 1);
		await vm.load();
		const ok = await vm.deleteGroup(group);
		expect(ok).toBe(true);
		expect(vm.getState().selectedId).toBeNull();
	});
});
