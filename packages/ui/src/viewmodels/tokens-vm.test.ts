import { describe, expect, test, vi } from "vitest";
import { createTokensVm } from "./tokens-vm";

const token = {
	id: 9,
	label: "prod",
	tokenPrefix: "xr_",
	scopes: ["push"],
	createdAtMs: 1,
	lastUsedAtMs: null,
	revokedAtMs: null,
};

describe("createTokensVm", () => {
	test("load + revoke reloads", async () => {
		const fetchPushTokens = vi.fn().mockResolvedValueOnce([token]).mockResolvedValueOnce([]);
		const revokePushToken = vi.fn().mockResolvedValue({ revoked: true });
		const vm = createTokensVm({ fetchPushTokens, revokePushToken });
		await vm.load();
		expect(vm.getState().tokens).toHaveLength(1);
		await vm.revoke(9);
		expect(revokePushToken).toHaveBeenCalledWith(9);
		expect(vm.getState().tokens).toEqual([]);
	});

	test("setOnceSecret", () => {
		const vm = createTokensVm({
			fetchPushTokens: vi.fn(),
			revokePushToken: vi.fn(),
		});
		vm.setOnceSecret("secret");
		expect(vm.getState().onceSecret).toBe("secret");
		vm.setOnceSecret(null);
		expect(vm.getState().onceSecret).toBeNull();
	});
});
