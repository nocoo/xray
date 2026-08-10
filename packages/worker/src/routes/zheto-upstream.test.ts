import { describe, expect, test } from "vitest";
import { defaultZhetoUpstream } from "./zheto.js";

describe("defaultZhetoUpstream", () => {
	test("posts JSON and parses body", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async (_u, init) => {
			expect(init?.method).toBe("POST");
			const body = JSON.parse(String(init?.body));
			expect(body.url).toBe("https://x.com/1");
			return new Response(JSON.stringify({ data: { shortUrl: "https://zhe.to/x", slug: "x" } }), {
				status: 201,
			});
		}) as typeof fetch;
		try {
			const r = await defaultZhetoUpstream("https://example.com/hook", {
				url: "https://x.com/1",
				note: "n",
			});
			expect(r.status).toBe(201);
			expect((r.json.data as { slug: string }).slug).toBe("x");
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("handles non-json body", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => new Response("not-json", { status: 400 })) as typeof fetch;
		try {
			const r = await defaultZhetoUpstream("https://example.com/hook", { url: "https://x.com/1" });
			expect(r.status).toBe(400);
			expect(r.json).toEqual({});
		} finally {
			globalThis.fetch = orig;
		}
	});
});
