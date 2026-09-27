import { describe, expect, test, vi } from "vitest";
import { createSettingsVm } from "./settings-vm";

describe("createSettingsVm", () => {
	test("load and save window hours", async () => {
		const fetchSettings = vi.fn().mockResolvedValue({
			email: "a@b.c",
			name: null,
			image: null,
			ingest: { windowHours: 12 },
		});
		const patchSettings = vi.fn().mockResolvedValue({
			email: "a@b.c",
			name: null,
			image: null,
			ingest: { windowHours: 48 },
		});
		const vm = createSettingsVm({ fetchSettings, patchSettings });
		await vm.load();
		expect(vm.getState().email).toBe("a@b.c");
		expect(vm.getState().windowHours).toBe(12);
		vm.setWindowHours(48);
		await vm.save();
		expect(patchSettings).toHaveBeenCalledWith(48);
		expect(vm.getState().saved).toBe(true);
		expect(vm.getState().windowHours).toBe(48);
	});

	test("load and save errors", async () => {
		const vm = createSettingsVm({
			fetchSettings: vi.fn().mockRejectedValue(new Error("nope")),
			patchSettings: vi.fn().mockRejectedValue(new Error("bad")),
		});
		await vm.load();
		expect(vm.getState().error).toBe("nope");
		await vm.save();
		expect(vm.getState().error).toBe("bad");
	});
});

test("dirty window tracks persisted value, failed save and edits made while saving", async () => {
	const settings = {
		email: "owner@xray.test",
		name: null,
		image: null,
		ingest: { windowHours: 24 },
	};
	let resolve!: (value: typeof settings) => void;
	const api = {
		fetchSettings: vi.fn().mockResolvedValue(settings),
		patchSettings: vi.fn().mockRejectedValueOnce(new Error("Unavailable")),
	};
	const vm = createSettingsVm(api);
	expect(vm.isDirty()).toBe(false);
	await vm.load();
	expect(vm.isDirty()).toBe(false);
	vm.setWindowHours(48);
	expect(vm.isDirty()).toBe(true);
	vm.setWindowHours(24);
	expect(vm.isDirty()).toBe(false);
	vm.setWindowHours(48);
	await vm.save();
	expect(vm.isDirty()).toBe(true);
	api.patchSettings.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const save = vm.save();
	vm.setWindowHours(72);
	resolve({ ...settings, ingest: { windowHours: 48 } });
	await save;
	expect(vm.getState().windowHours).toBe(72);
	expect(vm.isDirty()).toBe(true);
	vm.setWindowHours(48);
	expect(vm.isDirty()).toBe(false);
});
