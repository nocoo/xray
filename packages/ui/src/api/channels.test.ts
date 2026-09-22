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
	await api.createChannel("Research", "Reports");
	await api.updateChannel(4, "Daily", "Daily reports");
	await api.deleteChannel(4);
	await api.reorderChannels([4, 2]);
	await api.fetchArticles(4);
	await api.fetchArticles(4, "2026-09-22", 19);
	await api.fetchArticle(4, 19);
	await api.updateArticle(4, 19, {
		title: "Edited",
		report_date: "2026-09-22",
		markdown: "Updated",
	});
	await api.deleteArticle(4, 19);
	await api.fetchChannelKeys(4);
	await api.createChannelKey(4, "Agent");
	await api.revokeChannelKey(4, 2);
	expect(fetch.mock.calls.map((call) => [call[0], call[1].method ?? "GET", call[1].body])).toEqual([
		["/api/channels", "GET", undefined],
		["/api/channels", "POST", '{"name":"Research","description":"Reports"}'],
		["/api/channels/4", "PATCH", '{"name":"Daily","description":"Daily reports"}'],
		["/api/channels/4", "DELETE", undefined],
		["/api/channels/order", "PUT", '{"ids":[4,2]}'],
		["/api/channels/4/articles?", "GET", undefined],
		["/api/channels/4/articles?date=2026-09-22&before=19", "GET", undefined],
		["/api/channels/4/articles/19", "GET", undefined],
		[
			"/api/channels/4/articles/19",
			"PATCH",
			JSON.stringify({ title: "Edited", report_date: "2026-09-22", markdown: "Updated" }),
		],
		["/api/channels/4/articles/19", "DELETE", undefined],
		["/api/channels/4/keys", "GET", undefined],
		["/api/channels/4/keys", "POST", '{"label":"Agent"}'],
		["/api/channels/4/keys/2", "DELETE", undefined],
	]);
	sessionStorage.setItem("xray:data-mode", "product");
	await api.fetchChannels();
	expect(fetch.mock.lastCall?.[0]).toBe("/__product/api/channels");
});
