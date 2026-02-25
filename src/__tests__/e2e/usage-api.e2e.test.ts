import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Usage API Route
//
// Verifies GET /api/usage which returns usage statistics from the local DB.
// Tests the days parameter clamping (1-365) and response structure.
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

describe("e2e: usage api", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // GET /api/usage — default (30 days)
  // ---------------------------------------------------------------------------

  test("returns usage stats with default 30-day range", async () => {
    const res = await fetch(`${getBaseUrl()}/api/usage`);
    expect(res.status).toBe(200);

    const json = await res.json();

    // Verify response structure
    expect(json.summary).toBeDefined();
    expect(typeof json.summary.totalRequests).toBe("number");
    expect(typeof json.summary.uniqueEndpoints).toBe("number");

    expect(json.endpoints).toBeInstanceOf(Array);

    expect(json.daily).toBeInstanceOf(Array);
    expect(json.daily.length).toBe(30);

    expect(json.range).toBeDefined();
    expect(json.range.days).toBe(30);
    expect(json.range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(json.range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // ---------------------------------------------------------------------------
  // GET /api/usage?days=N — custom range
  // ---------------------------------------------------------------------------

  test("respects days=7 parameter", async () => {
    const res = await fetch(`${getBaseUrl()}/api/usage?days=7`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.range.days).toBe(7);
    expect(json.daily.length).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // GET /api/usage — days parameter clamping
  // ---------------------------------------------------------------------------

  test("falls back to 30 when days=0 (falsy)", async () => {
    const res = await fetch(`${getBaseUrl()}/api/usage?days=0`);
    expect(res.status).toBe(200);

    const json = await res.json();
    // parseInt("0") || 30 → 0 is falsy → defaults to 30
    expect(json.range.days).toBe(30);
    expect(json.daily.length).toBe(30);
  });

  test("clamps days=999 to maximum of 365", async () => {
    const res = await fetch(`${getBaseUrl()}/api/usage?days=999`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.range.days).toBe(365);
    expect(json.daily.length).toBe(365);
  });

  test("uses default when days is non-numeric", async () => {
    const res = await fetch(`${getBaseUrl()}/api/usage?days=abc`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.range.days).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // Daily array structure
  // ---------------------------------------------------------------------------

  test("daily entries have correct shape with zero-filled dates", async () => {
    const res = await fetch(`${getBaseUrl()}/api/usage?days=3`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.daily.length).toBe(3);

    for (const entry of json.daily) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.total).toBe("number");
      expect(entry.total).toBeGreaterThanOrEqual(0);
    }
  });
});
