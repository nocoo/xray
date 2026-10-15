import { afterEach, expect, test, vi } from "vitest";
import * as api from "./tokens";

afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.clear();
});
test("query token APIs keep management on authenticated browser paths", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
	vi.stubGlobal("fetch", fetch);
	const input = {
		label: "Reader",
		access: { mode: "selected" as const, watchlistIds: [1, 2], channelIds: [3] },
	};
	await api.createQueryToken(input);
	await api.updateQueryToken(8, input);
	await api.revokeQueryToken(8);
	expect(fetch.mock.calls.map(([path, init]) => [path, init.method, init.body])).toEqual([
		["/api/query-tokens", "POST", JSON.stringify(input)],
		["/api/query-tokens/8", "PATCH", JSON.stringify(input)],
		["/api/query-tokens/8", "DELETE", undefined],
	]);
});
test("global and watchlist token APIs use browser client methods and never Bearer administration", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) });
	vi.stubGlobal("fetch", fetch);
	expect(await api.fetchTokens()).toEqual([]);
	await api.createWatchlistToken("Producer");
	await api.renameWatchlistToken(4, "New name");
	await api.revokeWatchlistToken(4);
	await api.renameChannelKey(2, 3, "Agent");
	expect(fetch.mock.calls.map(([path, init]) => [path, init.method ?? "GET", init.body])).toEqual([
		["/api/tokens", "GET", undefined],
		["/api/push-tokens", "POST", '{"label":"Producer"}'],
		["/api/push-tokens/4", "PATCH", '{"label":"New name"}'],
		["/api/push-tokens/4", "DELETE", undefined],
		["/api/channels/2/keys/3", "PATCH", '{"label":"Agent"}'],
	]);
	for (const [, init] of fetch.mock.calls) {
		expect(init.credentials).toBe("same-origin");
		expect(init.headers).not.toHaveProperty("Authorization");
	}
});
