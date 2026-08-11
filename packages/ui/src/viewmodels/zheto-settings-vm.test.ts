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
});
