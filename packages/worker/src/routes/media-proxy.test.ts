import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AppEnv } from "../types.js";
import { mediaProxyRoute } from "./media-proxy.js";

function app() {
	const h = new Hono<AppEnv>();
	h.get("/api/media/proxy", mediaProxyRoute);
	return h;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("GET /api/media/proxy", () => {
	test("400 missing url", async () => {
		const res = await app().request("/api/media/proxy");
		expect(res.status).toBe(400);
	});

	test("400 invalid url", async () => {
		const res = await app().request("/api/media/proxy?url=not-a-url");
		expect(res.status).toBe(400);
	});

	test("400 http not https", async () => {
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("http://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(400);
	});

	test("403 host not allowed", async () => {
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://evil.com/x.mp4")}`,
		);
		expect(res.status).toBe(403);
	});

	test("streams allowed host body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: {
						"content-type": "video/mp4",
						"content-length": "3",
					},
				});
			}),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/amplify/x.mp4")}`,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("video/mp4");
		expect(res.headers.get("cache-control")).toContain("immutable");
		const buf = new Uint8Array(await res.arrayBuffer());
		expect([...buf]).toEqual([1, 2, 3]);
		expect(fetch).toHaveBeenCalled();
	});

	test("forwards Range and 206", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				const h = new Headers(init?.headers);
				expect(h.get("Range")).toBe("bytes=0-1");
				return new Response(new Uint8Array([1, 2]), {
					status: 206,
					headers: {
						"content-type": "video/mp4",
						"content-range": "bytes 0-1/10",
						"accept-ranges": "bytes",
					},
				});
			}),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://pbs.twimg.com/media/x.jpg")}`,
			{ headers: { Range: "bytes=0-1" } },
		);
		expect(res.status).toBe(206);
		expect(res.headers.get("content-range")).toBe("bytes 0-1/10");
	});

	test("upstream error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 404 })),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://abs.twimg.com/x")}`,
		);
		expect(res.status).toBe(404);
	});

	test("fetch throw → 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network");
			}),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(502);
	});

	test("non-Error throw → 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw "boom";
			}),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Unknown error");
	});

	test("defaults content-type and maps odd upstream status to 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("x", { status: 399, headers: {} })),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(502);
	});

	test("success without content-length/range headers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(new Uint8Array([9]), { status: 200, headers: {} })),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://pbs.twimg.com/media/z.jpg")}`,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/octet-stream");
		expect(res.headers.get("content-length")).toBeNull();
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});

	test("rejects redirect off allowlist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(null, {
					status: 302,
					headers: { location: "https://evil.com/steal" },
				});
			}),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(403);
	});

	test("follows same-host redirect", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const u = String(input);
			if (u.includes("first")) {
				return new Response(null, {
					status: 302,
					headers: { location: "https://pbs.twimg.com/media/second.jpg" },
				});
			}
			return new Response(new Uint8Array([7]), {
				status: 200,
				headers: { "content-type": "image/jpeg" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://pbs.twimg.com/media/first.jpg")}`,
		);
		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});

	test("rejects disallowed content-type", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response("<html>", {
						status: 200,
						headers: { "content-type": "text/html" },
					}),
			),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://pbs.twimg.com/media/x.jpg")}`,
		);
		expect(res.status).toBe(403);
	});

	test("redirect without location → 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 302, headers: {} })),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(502);
	});

	test("too many redirects → 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const u = String(input);
				const n = Number(new URL(u).searchParams.get("n") || "0");
				return new Response(null, {
					status: 302,
					headers: {
						location: `https://pbs.twimg.com/media/r.jpg?n=${n + 1}`,
					},
				});
			}),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://pbs.twimg.com/media/r.jpg?n=0")}`,
		);
		expect(res.status).toBe(502);
	});

	test("invalid redirect location → 502", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(null, {
						status: 302,
						headers: { location: "http://%" },
					}),
			),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://video.twimg.com/x.mp4")}`,
		);
		expect(res.status).toBe(502);
	});

	test("content-type with charset still allowed", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(new Uint8Array([1]), {
						status: 200,
						headers: { "content-type": "image/jpeg; charset=binary" },
					}),
			),
		);
		const res = await app().request(
			`/api/media/proxy?url=${encodeURIComponent("https://pbs.twimg.com/media/c.jpg")}`,
		);
		expect(res.status).toBe(200);
	});
});
