import { describe, expect, test, vi } from "vitest";
import { createZhetoSettingsVm } from "./zheto-settings-vm";

describe("createZhetoSettingsVm", () => {
	test("load and save", async () => {
		const fetchZhetoSettings = vi.fn().mockResolvedValue({
			configured: true,
			webhookUrlMasked: "https://…",
			folder: "inbox",
			updatedAtMs: 1,
		});
		const saveZhetoSettings = vi.fn().mockResolvedValue({
			configured: true,
			webhookUrlMasked: "https://…",
			folder: "out",
			updatedAtMs: 2,
		});
		const vm = createZhetoSettingsVm({ fetchZhetoSettings, saveZhetoSettings });
		await vm.load();
		expect(vm.getState().folder).toBe("inbox");
		vm.setWebhookUrl("https://zhe.to/hook");
		vm.setFolder("out");
		await vm.save();
		expect(saveZhetoSettings).toHaveBeenCalledWith({
			webhookUrl: "https://zhe.to/hook",
			folder: "out",
		});
		expect(vm.getState().webhookUrl).toBe("");
		expect(vm.getState().saved).toBe(true);
	});

	test("load and save errors", async () => {
		const vm = createZhetoSettingsVm({
			fetchZhetoSettings: vi.fn().mockRejectedValue(new Error("zload")),
			saveZhetoSettings: vi.fn().mockRejectedValue(new Error("zsave")),
		});
		await vm.load();
		expect(vm.getState().error).toBe("zload");
		await vm.save();
		expect(vm.getState().error).toBe("zsave");
	});

	test("folder null from settings", async () => {
		const vm = createZhetoSettingsVm({
			fetchZhetoSettings: vi.fn().mockResolvedValue({
				configured: false,
				webhookUrlMasked: "",
				folder: null,
				updatedAtMs: null,
			}),
			saveZhetoSettings: vi.fn().mockResolvedValue({
				configured: true,
				webhookUrlMasked: "…",
				folder: null,
				updatedAtMs: 1,
			}),
		});
		await vm.load();
		expect(vm.getState().folder).toBe("");
		await vm.save();
		expect(vm.getState().saved).toBe(true);
	});
});
