import { afterEach, expect, test, vi } from "vitest";
import * as api from "./tags";

afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.clear();
});
test("tag routes serialize names and assignments through the authenticated browser client", async () => {
	const data = { id: 3, name: "Research" };
	const fetch = vi
		.fn()
		.mockResolvedValue({ ok: true, json: async () => ({ success: true, data }) });
	vi.stubGlobal("fetch", fetch);
	expect(await api.fetchTags()).toEqual(data);
	expect(await api.createTag("Research")).toEqual(data);
	await api.renameTag(3, "Daily");
	await api.deleteTag(3);
	await api.assignChannelTags(4, [3]);
	await api.assignKeyTags(4, 8, []);
	expect(fetch.mock.calls.map(([url, init]) => [url, init.method ?? "GET", init.body])).toEqual([
		["/api/tags", "GET", undefined],
		["/api/tags", "POST", '{"name":"Research"}'],
		["/api/tags/3", "PATCH", '{"name":"Daily"}'],
		["/api/tags/3", "DELETE", undefined],
		["/api/channels/4/tags", "PUT", '{"tagIds":[3]}'],
		["/api/channels/4/keys/8/tags", "PUT", '{"tagIds":[]}'],
	]);
	for (const [, init] of fetch.mock.calls) expect(init.credentials).toBe("same-origin");
	sessionStorage.setItem("xray:data-mode", "product");
	await api.fetchTags();
	expect(fetch.mock.lastCall?.[0]).toBe("/__product/api/tags");
});
