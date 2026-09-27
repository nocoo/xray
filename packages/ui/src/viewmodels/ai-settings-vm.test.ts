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

	test("load/save/test throw", async () => {
		const vm = createAiSettingsVm({
			fetchAiConfig: vi.fn().mockRejectedValue(new Error("load-x")),
			saveAiConfig: vi.fn().mockRejectedValue(new Error("save-x")),
			testAiConfig: vi.fn().mockRejectedValue(new Error("test-x")),
		});
		await vm.load();
		expect(vm.getState().error).toBe("load-x");
		await vm.save();
		expect(vm.getState().error).toBe("save-x");
		await vm.test();
		expect(vm.getState().testMsg).toBe("test-x");
		expect(vm.getState().testOk).toBe(false);
	});

	test("nullish fields and test status fallback", async () => {
		const vm = createAiSettingsVm({
			fetchAiConfig: vi.fn().mockResolvedValue({
				...cfg,
				model: null,
				baseUrl: null,
				translationPrompt: null,
				summaryPrompt: null,
			}),
			saveAiConfig: vi.fn().mockResolvedValue(cfg),
			testAiConfig: vi.fn().mockResolvedValue({ ok: false, status: 503 }),
		});
		await vm.load();
		expect(vm.getState().model).toBe("");
		vm.patchForm({ model: "", baseUrl: "", apiKey: "", translationPrompt: "", summaryPrompt: "" });
		await vm.save();
		expect(vm.getState().saved).toBe(true);
		await vm.test();
		expect(vm.getState().testMsg).toContain("503");
		// ok without provider/model in response uses form defaults
		const vm2 = createAiSettingsVm({
			fetchAiConfig: vi.fn().mockResolvedValue({ configured: false }),
			saveAiConfig: vi.fn(),
			testAiConfig: vi.fn().mockResolvedValue({ ok: true }),
		});
		await vm2.load();
		await vm2.test();
		expect(vm2.getState().testMsg).toContain("OK");
		// failure without error or status
		const vm3 = createAiSettingsVm({
			fetchAiConfig: vi.fn().mockResolvedValue({ configured: false }),
			saveAiConfig: vi.fn(),
			testAiConfig: vi.fn().mockResolvedValue({ ok: false }),
		});
		await vm3.test();
		expect(vm3.getState().testMsg).toContain("unknown");
	});
});

test("AI drafts remain dirty on failed save or test and preserve newer edits during save", async () => {
	let resolve!: (value: typeof cfg) => void;
	const api = {
		fetchAiConfig: vi.fn().mockResolvedValue(cfg),
		saveAiConfig: vi.fn().mockRejectedValueOnce(new Error("Unavailable")),
		testAiConfig: vi.fn().mockResolvedValue({ ok: true }),
	};
	const vm = createAiSettingsVm(api);
	expect(vm.isDirty()).toBe(false);
	await vm.load();
	expect(vm.isDirty()).toBe(false);
	vm.patchForm({ model: "next-model" });
	expect(vm.isDirty()).toBe(true);
	vm.patchForm({ model: cfg.model });
	expect(vm.isDirty()).toBe(false);
	vm.patchForm({ apiKey: "draft-key", summaryPrompt: "new summary" });
	await vm.test();
	expect(vm.isDirty()).toBe(true);
	await vm.save();
	expect(vm.isDirty()).toBe(true);
	api.saveAiConfig.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const save = vm.save();
	vm.patchForm({ apiKey: "newer-key", model: "newer-model" });
	resolve(cfg);
	await save;
	expect(vm.getState()).toMatchObject({ apiKey: "newer-key", model: "newer-model" });
	expect(vm.isDirty()).toBe(true);
	api.saveAiConfig.mockResolvedValueOnce(cfg);
	await vm.save();
	expect(vm.isDirty()).toBe(false);
});
