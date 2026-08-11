import { describe, expect, test, vi } from "vitest";
import { createAiSettingsVm } from "./ai-settings-vm";

const cfg = {
	provider: "openai",
	model: "gpt-4o-mini",
	baseUrl: null,
	apiKeyMasked: "sk-…",
	hasApiKey: true,
	apiKeyKeyVersion: 1,
	translationPrompt: "t",
	summaryPrompt: null,
	updatedAtMs: 1,
};

describe("createAiSettingsVm", () => {
	test("load save test happy path", async () => {
		const fetchAiConfig = vi.fn().mockResolvedValue(cfg);
		const saveAiConfig = vi.fn().mockResolvedValue({ ...cfg, model: "gpt-x" });
		const testAiConfig = vi
			.fn()
			.mockResolvedValue({ ok: true, provider: "openai", model: "gpt-x" });
		const vm = createAiSettingsVm({ fetchAiConfig, saveAiConfig, testAiConfig });
		await vm.load();
		expect(vm.getState().provider).toBe("openai");
		vm.patchForm({ model: "gpt-x", apiKey: "sk-new" });
		await vm.save();
		expect(saveAiConfig).toHaveBeenCalled();
		expect(vm.getState().apiKey).toBe("");
		expect(vm.getState().saved).toBe(true);
		await vm.test();
		expect(vm.getState().testOk).toBe(true);
		expect(vm.getState().testMsg).toContain("OK");
	});

	test("test failure", async () => {
		const vm = createAiSettingsVm({
			fetchAiConfig: vi.fn().mockResolvedValue({ configured: false }),
			saveAiConfig: vi.fn(),
			testAiConfig: vi.fn().mockResolvedValue({ ok: false, error: "bad key" }),
		});
		await vm.load();
		await vm.test();
		expect(vm.getState().testOk).toBe(false);
		expect(vm.getState().testMsg).toContain("bad key");
	});
});
