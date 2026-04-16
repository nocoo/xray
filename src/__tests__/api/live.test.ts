import { describe, test, expect } from "bun:test";

describe("GET /api/live", () => {
  test("returns 200 with expected body", async () => {
    const { GET } = await import("@/app/api/live/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(typeof data.version).toBe("string");
    expect(data.component).toBe("xray");
  });

  test("sets no-store cache header", async () => {
    const { GET } = await import("@/app/api/live/route");
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
