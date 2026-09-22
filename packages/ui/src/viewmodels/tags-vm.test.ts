import { expect, test, vi } from "vitest";
import { createTagsVm } from "./tags-vm";

const tag = { id: 1, name: "Research" };
function setup() {
	const api = {
		fetchTags: vi.fn().mockResolvedValue([tag]),
		createTag: vi.fn().mockResolvedValue({ id: 2, name: "Daily" }),
		renameTag: vi.fn().mockResolvedValue({ ...tag, name: "Renamed" }),
		deleteTag: vi.fn().mockResolvedValue({ deleted: true as const }),
		assignChannelTags: vi.fn().mockResolvedValue([tag]),
		assignKeyTags: vi.fn().mockResolvedValue([tag]),
	};
	return { api, vm: createTagsVm(api) };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
test("CRUD normalizes names, retains unrelated tags and reports delete success", async () => {
	const { api, vm } = setup();
	await vm.load();
	expect(vm.getState()).toMatchObject({ tags: [tag], loading: false });
	await vm.create("  Daily  ");
	expect(api.createTag).toHaveBeenCalledWith("Daily");
	await vm.rename(1, " Renamed ");
	expect(api.renameTag).toHaveBeenCalledWith(1, "Renamed");
	expect(vm.getState().tags).toEqual([
		{ id: 1, name: "Renamed" },
		{ id: 2, name: "Daily" },
	]);
	expect(await vm.remove(1)).toBe(true);
	expect(vm.getState().tags).toEqual([{ id: 2, name: "Daily" }]);
});
test("validates trimmed names before writes and surfaces duplicate conflicts without losing tags", async () => {
	const { api, vm } = setup();
	await vm.load();
	for (const name of ["  ", "x".repeat(65)]) {
		expect(await vm.create(name)).toBeUndefined();
		expect(await vm.rename(1, name)).toBeUndefined();
		expect(vm.getState().error).toContain("1 and 64");
	}
	expect(api.createTag).not.toHaveBeenCalled();
	expect(api.renameTag).not.toHaveBeenCalled();
	api.createTag.mockRejectedValueOnce(new Error("Tag already exists"));
	await vm.create("Research");
	expect(vm.getState()).toMatchObject({ tags: [tag], busy: false, error: "Tag already exists" });
	await vm.create("x".repeat(64));
	expect(vm.getState().error).toBeNull();
});
test("channel and token assignment deduplicate, allow clearing, and enforce the 20-tag limit", async () => {
	const { api, vm } = setup();
	expect(await vm.assign(3, undefined, [1, 1])).toEqual([tag]);
	expect(api.assignChannelTags).toHaveBeenCalledWith(3, [1]);
	await vm.assign(3, 4, []);
	expect(api.assignKeyTags).toHaveBeenCalledWith(3, 4, []);
	const ids = Array.from({ length: 20 }, (_, i) => i + 1);
	await vm.assign(3, undefined, ids);
	expect(api.assignChannelTags).toHaveBeenLastCalledWith(3, ids);
	expect(await vm.assign(3, undefined, [...ids, 21])).toBeUndefined();
	expect(vm.getState().error).toBe("Choose up to 20 tags.");
	expect(await vm.createAndAssign(3, 4, ids, "Daily")).toBeUndefined();
	expect(api.createTag).not.toHaveBeenCalled();
});
test("inline creation assigns the new tag and preserves catalog when assignment fails", async () => {
	const { api, vm } = setup();
	expect(await vm.createAndAssign(3, 4, [1], " Daily ")).toEqual([tag]);
	expect(api.assignKeyTags).toHaveBeenCalledWith(3, 4, [1, 2]);
	api.assignChannelTags.mockRejectedValueOnce("Assignment failed");
	expect(await vm.createAndAssign(3, undefined, [], "Other")).toBeUndefined();
	expect(vm.getState().tags).toContainEqual({ id: 2, name: "Daily" });
	expect(vm.getState().error).toBe("Assignment failed");
});
test("serializes mutations and ignores a catalog load superseded by a write", async () => {
	const { api, vm } = setup();
	const old = deferred<(typeof tag)[]>();
	api.fetchTags.mockReturnValueOnce(old.promise);
	const loading = vm.load();
	const pending = deferred<typeof tag>();
	api.createTag.mockReturnValueOnce(pending.promise);
	const creation = vm.create("Research");
	expect(await vm.remove(1)).toBeUndefined();
	expect(api.deleteTag).not.toHaveBeenCalled();
	pending.resolve(tag);
	await creation;
	old.resolve([]);
	await loading;
	expect(vm.getState()).toMatchObject({ tags: [tag], busy: false, loading: false });
});
test("newer loads win and stale load errors cannot overwrite success", async () => {
	const { api, vm } = setup();
	const old = deferred<(typeof tag)[]>();
	api.fetchTags.mockReturnValueOnce(old.promise);
	const loading = vm.load();
	await vm.load();
	old.reject(new Error("stale"));
	await loading;
	expect(vm.getState()).toMatchObject({ tags: [tag], error: null, loading: false });
	api.fetchTags.mockRejectedValueOnce(new Error("Offline"));
	await vm.load();
	expect(vm.getState()).toMatchObject({ tags: [tag], error: "Offline", loading: false });
});
