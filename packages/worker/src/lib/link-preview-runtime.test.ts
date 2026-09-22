import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const {
	Miniflare,
	convertV4MiniflareOptions,
	Response: RuntimeResponse,
} = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");
let runtime: InstanceType<typeof Miniflare>;

describe("link preview with native workerd HTMLRewriter", () => {
	beforeAll(async () => {
		const bundle = await build({
			stdin: {
				contents: `import { parsePreviewHtml, fetchLinkPreview } from './src/lib/link-preview.ts';
     import { hasPublicDns } from './src/lib/link-preview-url.ts';
     export default { async fetch(request) {
      const input = await request.json();
      if (input.dns) return Response.json(await hasPublicDns(new URL(input.url), new AbortController().signal));
      const result = input.html !== undefined
       ? await parsePreviewHtml(input.html, input.pageUrl, input.url)
       : await fetchLinkPreview(input.url);
      return Response.json(result);
     } };`,
				resolveDir: process.cwd(),
				loader: "ts",
			},
			bundle: true,
			format: "esm",
			platform: "browser",
			write: false,
		});
		runtime = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				script: bundle.outputFiles[0].text,
				compatibilityDate: "2026-09-18",
				outboundService: async (request: Request) => {
					const url = new URL(request.url);
					if (url.hostname === "cloudflare-dns.com")
						return RuntimeResponse.json({
							Status: 0,
							Answer:
								url.searchParams.get("type") === "AAAA"
									? [{ type: 28, data: "2606:4700::1111" }]
									: [{ type: 1, data: "93.184.216.34" }],
						});
					if (url.pathname === "/redirect")
						return new RuntimeResponse(null, { status: 302, headers: { location: "/page" } });
					return new RuntimeResponse(
						'<title>Fallback</title><meta property="og:title" content="Live OG"><meta property="og:image" content="/photo.png">',
						{ headers: { "content-type": "text/html" } },
					);
				},
			}),
		);
		await runtime.ready;
	}, 30000);
	afterAll(async () => {
		await runtime?.dispose();
	});

	async function parse(html: string) {
		const response = await runtime.dispatchFetch("https://worker.test", {
			method: "POST",
			body: JSON.stringify({
				html,
				pageUrl: "https://news.example.com/path/page",
				url: "https://news.example.com/original",
			}),
		});
		return response.json();
	}
	test("native selectors parse quoted attributes, chunked title, priority and relative images", async () => {
		expect(
			await parse(`<HTML><head><title>Fallback title</title>
   <META NAME='description' CONTENT='Fallback description'>
   <meta name="twitter:title" content="Twitter title">
   <meta property="og:title" content="OG title"><meta property="og:title" content="Ignored duplicate">
   <meta name="twitter:description" content="Twitter description">
   <meta property="og:description" content="OG description">
   <meta property="og:site_name" content="Publisher">
   <meta property="og:image" content="../cover.png#preview">
   </head><body><script>const fake = '<meta property="og:title" content="Fake">';</script></body></HTML>`),
		).toEqual({
			url: "https://news.example.com/original",
			title: "OG title",
			description: "OG description",
			imageUrl: "https://news.example.com/cover.png",
			siteName: "Publisher",
		});
	});
	test("decodes native HTML entities in titles and image query parameters", async () => {
		expect(
			await parse(
				'<title>Fish &amp; Chips &#x1f41f;</title><meta name="description" content="A &amp; B"><meta property="og:image" content="/image?x=1&amp;y=2">',
			),
		).toMatchObject({
			title: "Fish & Chips 🐟",
			description: "A & B",
			imageUrl: "https://news.example.com/image?x=1&y=2",
		});
	});
	test("uses native title/meta fallback and ignores invalid external images", async () => {
		expect(
			await parse(
				'<title> First\n title </title><meta name="description" content="Details"><meta property="og:image" content="http://localhost/a">',
			),
		).toMatchObject({ title: "First title", description: "Details", imageUrl: null });
		expect(
			await parse(
				'<meta name="twitter:title" content="Twitter"><meta name="twitter:image" content="https://images.example.com/a.png">',
			),
		).toMatchObject({ title: "Twitter", imageUrl: "https://images.example.com/a.png" });
		expect(await parse("<body>No metadata</body>")).toMatchObject({
			title: null,
			description: null,
			imageUrl: null,
			siteName: null,
		});
	});
	test("fetch pipeline validates DNS and redirects and parses HTML in the actual Worker runtime", async () => {
		const dns = await runtime.dispatchFetch("https://worker.test", {
			method: "POST",
			body: JSON.stringify({ dns: true, url: "https://news.example.com/redirect" }),
		});
		expect(await dns.text()).toBe("true");
		const response = await runtime.dispatchFetch("https://worker.test", {
			method: "POST",
			body: JSON.stringify({ url: "https://news.example.com/redirect" }),
		});
		expect(await response.json()).toMatchObject({
			url: "https://news.example.com/redirect",
			title: "Live OG",
			imageUrl: "https://news.example.com/photo.png",
		});
	});
});
