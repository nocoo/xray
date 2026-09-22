import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	fetchLinkPreview,
	PREVIEW_MAX_BYTES,
	PREVIEW_TIMEOUT_MS,
	parsePreviewHtml,
	previewCacheKey,
	unavailablePreview,
} from "./link-preview.js";
import * as urls from "./link-preview-url.js";

type Handler = {
	element?: (element: { getAttribute: (name: string) => string | null }) => void;
	text?: (chunk: { text: string }) => void;
};
let metadata: Record<string, string>[];
let titleChunks: string[];
let inputHtml: string;

beforeEach(() => {
	metadata = [];
	titleChunks = [];
	vi.stubGlobal(
		"HTMLRewriter",
		class {
			handlers = new Map<string, Handler>();
			on(selector: string, handler: Handler) {
				this.handlers.set(selector, handler);
				return this;
			}
			transform(response: Response) {
				for (const attrs of metadata)
					this.handlers.get("meta")?.element?.({ getAttribute: (name) => attrs[name] ?? null });
				for (const text of titleChunks) this.handlers.get("title")?.text?.({ text });
				return {
					arrayBuffer: async () => {
						inputHtml = await response.text();
						return new ArrayBuffer(0);
					},
				};
			}
		},
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
const original = "https://news.example.com/page";

describe("link preview metadata and bounded fetching", () => {
	test("metadata priority, first value, title chunks, whitespace and image safety", async () => {
		metadata = [
			{ property: "OG:TITLE", content: " OG  title " },
			{ property: "og:title", content: "ignored" },
			{ name: "twitter:title", content: "Twitter" },
			{ name: "description", content: "Fallback" },
			{ property: "og:description", content: "OG description" },
			{ name: "twitter:description", content: "Twitter description" },
			{ property: "og:image", content: "../cover.png#x" },
			{ property: "og:site_name", content: "Site" },
			{},
			{ property: "og:empty", content: "  " },
		];
		titleChunks = ["Fallback", " title"];
		expect(await parsePreviewHtml("<html>", original, original)).toEqual({
			url: original,
			title: "OG title",
			description: "OG description",
			imageUrl: "https://news.example.com/cover.png",
			siteName: "Site",
		});
		metadata = [
			{ name: "twitter:title", content: "Twitter" },
			{ name: "twitter:description", content: "Twitter description" },
			{ name: "twitter:image", content: "http://localhost/a" },
		];
		expect(await parsePreviewHtml("", original, original)).toMatchObject({
			title: "Twitter",
			description: "Twitter description",
			imageUrl: null,
		});
		metadata = [{ name: "description", content: "Meta description" }];
		expect(await parsePreviewHtml("", original, original)).toMatchObject({
			title: "Fallback title",
			description: "Meta description",
		});
		metadata = [];
		titleChunks = [];
		expect(await parsePreviewHtml("", original, original)).toEqual(unavailablePreview(original));
		titleChunks = ["x".repeat(10000)];
		expect((await parsePreviewHtml("", original, original)).title).toHaveLength(1000);
	});
	test("decodes entities once before validating URLs and normalizing metadata", async () => {
		titleChunks = ["Fish &amp; Chips &#x1f41f;"];
		metadata = [
			{ name: "description", content: "A &amp; B" },
			{ property: "og:image", content: "/image?x=1&amp;y=2" },
		];
		expect(await parsePreviewHtml("", original, original)).toMatchObject({
			title: "Fish & Chips 🐟",
			description: "A & B",
			imageUrl: "https://news.example.com/image?x=1&y=2",
		});
		metadata = [
			{ property: "og:title", content: "A &amp;amp; B" },
			{ property: "og:image", content: "https://&#49;27.0.0.1/private" },
		];
		expect(await parsePreviewHtml("", original, original)).toMatchObject({
			title: "A &amp; B",
			imageUrl: null,
		});
	});
	test("validates every redirect, sends no credentials and truncates streamed HTML", async () => {
		const dns = vi.spyOn(urls, "hasPublicDns").mockResolvedValue(true);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/next" } }))
			.mockResolvedValueOnce(
				new Response("x".repeat(PREVIEW_MAX_BYTES + 1), {
					headers: { "content-type": "text/html; charset=utf-8" },
				}),
			);
		vi.stubGlobal("fetch", fetcher);
		titleChunks = ["Parsed"];
		expect(await fetchLinkPreview(original)).toMatchObject({ title: "Parsed", url: original });
		expect(inputHtml.length).toBe(PREVIEW_MAX_BYTES);
		expect(dns).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[1][0].href).toBe("https://news.example.com/next");
		expect(fetcher.mock.calls[0][1]).toMatchObject({
			redirect: "manual",
			headers: { Accept: "text/html" },
		});
		expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
		expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Cookie");
	});
	test("blocked inputs and DNS fail closed without fetching the page", async () => {
		const dns = vi.spyOn(urls, "hasPublicDns").mockResolvedValue(false);
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		expect(await fetchLinkPreview("https://127.0.0.1")).toEqual(
			unavailablePreview("https://127.0.0.1"),
		);
		expect(dns).not.toHaveBeenCalled();
		expect(await fetchLinkPreview(original)).toEqual(unavailablePreview(original));
		expect(fetcher).not.toHaveBeenCalled();
		dns.mockRejectedValue(Error("DNS failed"));
		expect(await fetchLinkPreview(original)).toEqual(unavailablePreview(original));
	});
	test.each([
		() => new Response(null, { status: 302 }),
		() => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } }),
		() => new Response(null, { status: 404 }),
		() => new Response(null, { headers: { "content-type": "image/png" } }),
		() =>
			new Response(null, {
				headers: { "content-type": "text/html", "content-length": String(PREVIEW_MAX_BYTES + 1) },
			}),
	])("unavailable and unsafe responses return only null metadata", async (response) => {
		vi.spyOn(urls, "hasPublicDns").mockResolvedValue(true);
		const fetcher = vi.fn().mockImplementation(async () => response());
		vi.stubGlobal("fetch", fetcher);
		expect(await fetchLinkPreview(original)).toEqual(unavailablePreview(original));
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	test("caps redirect hops at three and aborts stalled upstream requests", async () => {
		vi.spyOn(urls, "hasPublicDns").mockResolvedValue(true);
		const fetcher = vi
			.fn()
			.mockImplementation(
				async () => new Response(null, { status: 307, headers: { location: "/loop" } }),
			);
		vi.stubGlobal("fetch", fetcher);
		expect(await fetchLinkPreview(original)).toEqual(unavailablePreview(original));
		expect(fetcher).toHaveBeenCalledTimes(4);
		vi.useFakeTimers();
		fetcher.mockImplementation(
			(_url, { signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(Error("aborted")));
				}),
		);
		const pending = fetchLinkPreview(original);
		await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
		expect(await pending).toEqual(unavailablePreview(original));
	});
	test("cache keys hide and separate tenant identifiers and URLs", async () => {
		const a = await previewCacheKey("tenant-a", original);
		expect((await previewCacheKey("tenant-a", original)).url).toBe(a.url);
		expect((await previewCacheKey("tenant-b", original)).url).not.toBe(a.url);
		expect((await previewCacheKey("tenant-a", `${original}?q=2`)).url).not.toBe(a.url);
		expect(a.url).not.toContain("tenant-a");
		expect(a.url).not.toContain("news.example.com");
	});
});
