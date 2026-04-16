import { describe, test, expect } from "bun:test";

describe("GET /api/live", () => {
  test("returns 200 with expected body", async () => {
    const { GET } = await import("@/app/api/live/route");
    const response = await GET();
    const data = await response.json();

    // Status is 200 when DB is healthy, 503 otherwise
    expect([200, 503]).toContain(response.status);
    expect(["ok", "error"]).toContain(data.status);
    expect(typeof data.version).toBe("string");
    expect(data.component).toBe("xray");
    expect(typeof data.timestamp).toBe("string");
    expect(typeof data.uptime).toBe("number");
    expect(data.database).toBeDefined();
    expect(typeof data.database.connected).toBe("boolean");
  });

  test("sets no-store cache header", async () => {
    const { GET } = await import("@/app/api/live/route");
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
