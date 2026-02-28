import { describe, test, expect, beforeEach, mock } from "bun:test";

// Store original fetch so we can restore it
const originalFetch = globalThis.fetch;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockFetch(impl: (...args: any[]) => any) {
  globalThis.fetch = mock(impl) as unknown as typeof fetch;
}

function makeReq(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/media/proxy");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url);
}

describe("GET /api/media/proxy", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/media/proxy/route");
    GET = mod.GET;
    globalThis.fetch = originalFetch;
  });

  // ---- Validation ----

  test("returns 400 when url parameter is missing", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing url");
  });

  test("returns 400 for invalid url", async () => {
    const res = await GET(makeReq({ url: "not-a-url" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid url");
  });

  test("returns 403 for disallowed host", async () => {
    const res = await GET(makeReq({ url: "https://evil.com/hack.mp4" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Host not allowed");
  });

  test("returns 400 for HTTP (non-HTTPS) url", async () => {
    const res = await GET(makeReq({ url: "http://video.twimg.com/test.mp4" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Only HTTPS");
  });

  // ---- Allowed hosts ----

  test("allows video.twimg.com and streams response", async () => {
    const fakeBody = new Blob(["fake-video-data"]);
    mockFetch(() =>
      Promise.resolve(
        new Response(fakeBody, {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": "15",
          },
        }),
      ),
    );

    const res = await GET(
      makeReq({ url: "https://video.twimg.com/tweet_video/abc.mp4" }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("15");
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = await res.text();
    expect(body).toBe("fake-video-data");
  });

  test("allows pbs.twimg.com", async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response("img", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    );

    const res = await GET(
      makeReq({ url: "https://pbs.twimg.com/media/abc.jpg" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  test("allows abs.twimg.com", async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response("data", {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
      ),
    );

    const res = await GET(
      makeReq({ url: "https://abs.twimg.com/some/path" }),
    );
    expect(res.status).toBe(200);
  });

  // ---- Error propagation ----

  test("returns upstream error status on non-200", async () => {
    mockFetch(() => Promise.resolve(new Response(null, { status: 404 })));

    const res = await GET(
      makeReq({ url: "https://video.twimg.com/missing.mp4" }),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Upstream returned 404");
  });

  test("returns 502 on fetch failure", async () => {
    mockFetch(() => Promise.reject(new Error("Network down")));

    const res = await GET(
      makeReq({ url: "https://video.twimg.com/fail.mp4" }),
    );
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("Network down");
  });

  // ---- Security: no Referer/Origin leaked ----

  test("does not pass Referer or Origin to upstream", async () => {
    let capturedHeaders: Headers | null = null;
    mockFetch((_input: any, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response("ok", {
          status: 200,
          headers: { "content-type": "video/mp4" },
        }),
      );
    });

    await GET(makeReq({ url: "https://video.twimg.com/test.mp4" }));

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get("referer")).toBeNull();
    expect(capturedHeaders!.get("origin")).toBeNull();
  });
});
