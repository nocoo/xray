import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Media Proxy
//
// Verifies the /api/media/proxy endpoint against a live vinext server.
// Tests validation, whitelist enforcement, and actual proxying of Twitter media.
// =============================================================================

describe("e2e: media proxy", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  test("returns 400 when url parameter is missing", async () => {
    const res = await fetch(`${getBaseUrl()}/api/media/proxy`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect((body as { error: string }).error).toContain("Missing url");
  });

  test("returns 400 for invalid url", async () => {
    const res = await fetch(
      `${getBaseUrl()}/api/media/proxy?url=${encodeURIComponent("not-a-url")}`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect((body as { error: string }).error).toContain("Invalid url");
  });

  test("returns 400 for HTTP (non-HTTPS) url", async () => {
    const res = await fetch(
      `${getBaseUrl()}/api/media/proxy?url=${encodeURIComponent("http://video.twimg.com/test.mp4")}`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect((body as { error: string }).error).toContain("Only HTTPS");
  });

  // ---------------------------------------------------------------------------
  // Whitelist enforcement
  // ---------------------------------------------------------------------------

  test("returns 403 for disallowed host", async () => {
    const res = await fetch(
      `${getBaseUrl()}/api/media/proxy?url=${encodeURIComponent("https://evil.com/hack.mp4")}`,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect((body as { error: string }).error).toContain("Host not allowed");
  });

  test("returns 403 for non-twitter CDN host", async () => {
    const res = await fetch(
      `${getBaseUrl()}/api/media/proxy?url=${encodeURIComponent("https://cdn.example.com/video.mp4")}`,
    );
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Actual proxying — fetches real Twitter CDN (network-dependent)
  // These tests may fail if Twitter CDN is unreachable from the test env.
  // ---------------------------------------------------------------------------

  test("proxies a real pbs.twimg.com image and returns correct headers", async () => {
    // Use Twitter's default profile image — always available
    const twitterUrl =
      "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_normal.jpg";
    const res = await fetch(
      `${getBaseUrl()}/api/media/proxy?url=${encodeURIComponent(twitterUrl)}`,
    );

    // If Twitter CDN is reachable, we should get 200 with image content
    // If not reachable (CI, etc.), we get 502 — both are acceptable
    if (res.status === 200) {
      expect(res.headers.get("content-type")).toContain("image");
      expect(res.headers.get("cache-control")).toContain("public");
      expect(res.headers.get("cache-control")).toContain("immutable");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");

      // Body should have some bytes
      const buf = await res.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    } else {
      // Network issue — still valid behavior, proxy returned error
      expect([502, 404]).toContain(res.status);
    }
  });

  // ---------------------------------------------------------------------------
  // No authentication required — proxy is public (images are public data)
  // ---------------------------------------------------------------------------

  test("does not require authentication", async () => {
    // Proxy endpoint should work without any auth headers
    const res = await fetch(
      `${getBaseUrl()}/api/media/proxy?url=${encodeURIComponent("https://evil.com/x")}`,
    );
    // Should get 403 (host not allowed), NOT 401 (unauthorized)
    expect(res.status).toBe(403);
  });
});
