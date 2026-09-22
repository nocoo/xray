import { afterEach, expect, test, vi } from "vitest";
import { fetchArticleLinkPreview } from "./article-links";

afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.clear();
});
const preview = {
	url: "https://example.com/a?x=1&y=two",
	title: null,
	description: null,
	imageUrl: null,
	siteName: null,
};
test("preview GET encodes the full URL and preserves browser credentials, mode and cancellation", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: preview }) });
	vi.stubGlobal("fetch", fetch);
	const controller = new AbortController();
	expect(await fetchArticleLinkPreview(4, 9, preview.url, controller.signal)).toEqual(preview);
	const [path, init] = fetch.mock.calls[0] as [string, RequestInit];
	expect(path.split("?")[0]).toBe("/api/channels/4/articles/9/link-preview");
	expect(new URLSearchParams(path.split("?")[1]).get("url")).toBe(preview.url);
	expect(init).toEqual({
		credentials: "same-origin",
		headers: { Accept: "application/json" },
		signal: controller.signal,
	});
	sessionStorage.setItem("xray:data-mode", "product");
	await fetchArticleLinkPreview(4, 9, preview.url, controller.signal);
	expect(fetch.mock.lastCall?.[0]).toContain("/__product/api/");
	controller.abort();
	expect(init.signal?.aborted).toBe(true);
});
test("HTTP and envelope errors reject instead of becoming metadata", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Not allowed" }) })
		.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false }) });
	vi.stubGlobal("fetch", fetch);
	const signal = new AbortController().signal;
	await expect(fetchArticleLinkPreview(1, 2, preview.url, signal)).rejects.toMatchObject({
		status: 403,
		message: "Not allowed",
	});
	await expect(fetchArticleLinkPreview(1, 2, preview.url, signal)).rejects.toThrow(
		"request failed",
	);
});
