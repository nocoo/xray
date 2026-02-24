import { describe, test, expect, beforeEach } from "bun:test";
import { createTestDb, resetTestDb } from "@/db";

describe("GET /api/live", () => {
  beforeEach(() => {
    resetTestDb();
  });

  test("returns ok status with database connectivity", async () => {
    // Ensure test DB is initialized
    createTestDb();

    const { GET } = await import("@/app/api/live/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(typeof data.timestamp).toBe("number");
    expect(typeof data.uptime).toBe("number");
    expect(data.checks.database).toBe("ok");
  });

  test("timestamp is close to current time", async () => {
    createTestDb();

    const before = Date.now();
    const { GET } = await import("@/app/api/live/route");
    const response = await GET();
    const after = Date.now();
    const data = await response.json();

    expect(data.timestamp).toBeGreaterThanOrEqual(before);
    expect(data.timestamp).toBeLessThanOrEqual(after);
  });

  test("uptime is a non-negative integer", async () => {
    createTestDb();

    const { GET } = await import("@/app/api/live/route");
    const response = await GET();
    const data = await response.json();

    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(data.uptime)).toBe(true);
  });
});
