import { afterEach, expect, test, vi } from "vitest";
import * as api from "./channels";

afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.clear();
});
test("channel API uses tenant browser client, serialized bodies and date/cursor queries", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { id: 4 } }) });
	vi.stubGlobal("fetch", fetch);
	expect(await api.fetchChannels()).toEqual({ id: 4 });
	await api.createChannel("Research");
	await api.renameChannel(4, "Daily");
	await api.fetchArticles(4);
	await api.fetchArticles(4, "2026-09-22", 19);
	await api.fetchArticle(4, 19);
	await api.fetchChannelKeys(4);
	await api.createChannelKey(4, "Agent");
	await api.revokeChannelKey(4, 2);
	expect(fetch.mock.calls.map((call) => [call[0], call[1].method ?? "GET", call[1].body])).toEqual([
		["/api/channels", "GET", undefined],
		["/api/channels", "POST", '{"name":"Research"}'],
		["/api/channels/4", "PATCH", '{"name":"Daily"}'],
		["/api/channels/4/articles?", "GET", undefined],
		["/api/channels/4/articles?date=2026-09-22&before=19", "GET", undefined],
		["/api/channels/4/articles/19", "GET", undefined],
		["/api/channels/4/keys", "GET", undefined],
		["/api/channels/4/keys", "POST", '{"label":"Agent"}'],
		["/api/channels/4/keys/2", "DELETE", undefined],
	]);
	sessionStorage.setItem("xray:data-mode", "product");
	await api.fetchChannels();
	expect(fetch.mock.lastCall?.[0]).toBe("/__product/api/channels");
});
