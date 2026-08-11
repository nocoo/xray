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
});
