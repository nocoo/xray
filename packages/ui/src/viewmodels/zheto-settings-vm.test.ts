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

test("integration dirty state covers secret and folder, retains failed and concurrent edits", async () => {
	const settings = {
		configured: true,
		webhookUrlMasked: "https://…",
		folder: "inbox",
		updatedAtMs: 1,
	};
	let resolve!: (value: typeof settings) => void;
	const api = {
		fetchZhetoSettings: vi.fn().mockResolvedValue(settings),
		saveZhetoSettings: vi.fn().mockRejectedValueOnce(new Error("Unavailable")),
	};
	const vm = createZhetoSettingsVm(api);
	expect(vm.isDirty()).toBe(false);
	await vm.load();
	expect(vm.isDirty()).toBe(false);
	vm.setFolder("reports");
	expect(vm.isDirty()).toBe(true);
	vm.setFolder("inbox");
	expect(vm.isDirty()).toBe(false);
	vm.setWebhookUrl("https://zhe.to/draft");
	await vm.save();
	expect(vm.isDirty()).toBe(true);
	api.saveZhetoSettings.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const save = vm.save();
	vm.setWebhookUrl("https://zhe.to/newer");
	vm.setFolder("newer folder");
	resolve(settings);
	await save;
	expect(vm.getState()).toMatchObject({
		webhookUrl: "https://zhe.to/newer",
		folder: "newer folder",
	});
	expect(vm.isDirty()).toBe(true);
	api.saveZhetoSettings.mockResolvedValueOnce({ ...settings, folder: "newer folder" });
	await vm.save();
	expect(vm.isDirty()).toBe(false);
});
