import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as watchlistsRepo from "@/db/repositories/watchlists";
import * as watchlistRepo from "@/db/repositories/watchlist";

const BASE = "http://localhost/api/watchlists";

function jsonReq(method: string, body?: unknown, query?: string) {
  const url = query ? `${BASE}?${query}` : BASE;
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  createTestDb();
  process.env.E2E_SKIP_AUTH = "true";
  db.insert(users)
    .values({ id: "e2e-test-user", name: "E2E Test User", email: "e2e@test.com" })
    .run();
});

afterEach(() => {
  closeDb();
  delete process.env.E2E_SKIP_AUTH;
});

// =============================================================================
// GET /api/watchlists
// =============================================================================

describe("GET /api/watchlists", () => {
  test("returns empty array initially", async () => {
    const { GET } = await import("@/app/api/watchlists/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test("returns all user watchlists", async () => {
    watchlistsRepo.create({ userId: "e2e-test-user", name: "List A" });
    watchlistsRepo.create({ userId: "e2e-test-user", name: "List B" });

    const { GET } = await import("@/app/api/watchlists/route");
    const res = await GET();
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  test("does not return other users' watchlists", async () => {
    db.insert(users)
      .values({ id: "other-user", email: "other@example.com" })
      .run();
    watchlistsRepo.create({ userId: "other-user", name: "Secret" });
    watchlistsRepo.create({ userId: "e2e-test-user", name: "Mine" });

    const { GET } = await import("@/app/api/watchlists/route");
    const res = await GET();
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Mine");
  });
});

// =============================================================================
// POST /api/watchlists
// =============================================================================

describe("POST /api/watchlists", () => {
  test("creates a watchlist with defaults", async () => {
    const { POST } = await import("@/app/api/watchlists/route");
    const res = await POST(jsonReq("POST", { name: "AI Traders" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("AI Traders");
    expect(body.data.icon).toBe("eye");
    expect(body.data.translateEnabled).toBe(1);
    expect(body.data.description).toBeNull();
  });

  test("creates with custom icon and description", async () => {
    const { POST } = await import("@/app/api/watchlists/route");
    const res = await POST(
      jsonReq("POST", {
        name: "Crypto",
        description: "Crypto influencers",
        icon: "bitcoin",
        translateEnabled: 0,
      }),
    );
    const body = await res.json();
    expect(body.data.icon).toBe("bitcoin");
    expect(body.data.description).toBe("Crypto influencers");
    expect(body.data.translateEnabled).toBe(0);
  });

  test("returns 400 for missing name", async () => {
    const { POST } = await import("@/app/api/watchlists/route");
    const res = await POST(jsonReq("POST", {}));
    expect(res.status).toBe(400);
  });

  test("returns 400 for blank name", async () => {
    const { POST } = await import("@/app/api/watchlists/route");
    const res = await POST(jsonReq("POST", { name: "  " }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid JSON", async () => {
    const { POST } = await import("@/app/api/watchlists/route");
    const res = await POST(
      new Request(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("trims whitespace from name", async () => {
    const { POST } = await import("@/app/api/watchlists/route");
    const res = await POST(jsonReq("POST", { name: "  Spaced  " }));
    const body = await res.json();
    expect(body.data.name).toBe("Spaced");
  });
});

// =============================================================================
// PUT /api/watchlists
// =============================================================================

describe("PUT /api/watchlists", () => {
  test("updates name", async () => {
    const wl = watchlistsRepo.create({ userId: "e2e-test-user", name: "Old" });

    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(jsonReq("PUT", { id: wl.id, name: "New Name" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("New Name");
  });

  test("updates icon and translateEnabled", async () => {
    const wl = watchlistsRepo.create({ userId: "e2e-test-user", name: "Test" });

    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(
      jsonReq("PUT", { id: wl.id, icon: "radar", translateEnabled: 0 }),
    );
    const body = await res.json();
    expect(body.data.icon).toBe("radar");
    expect(body.data.translateEnabled).toBe(0);
  });

  test("partial update preserves other fields", async () => {
    const wl = watchlistsRepo.create({
      userId: "e2e-test-user",
      name: "Test",
      icon: "brain",
      translateEnabled: 0,
    });

    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(jsonReq("PUT", { id: wl.id, name: "Renamed" }));
    const body = await res.json();
    expect(body.data.name).toBe("Renamed");
    expect(body.data.icon).toBe("brain");
    expect(body.data.translateEnabled).toBe(0);
  });

  test("returns 400 for missing id", async () => {
    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(jsonReq("PUT", { name: "test" }));
    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent watchlist", async () => {
    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(jsonReq("PUT", { id: 999, name: "test" }));
    expect(res.status).toBe(404);
  });

  test("returns 404 when updating another user's watchlist", async () => {
    db.insert(users)
      .values({ id: "other-user", email: "other@example.com" })
      .run();
    const wl = watchlistsRepo.create({ userId: "other-user", name: "Secret" });

    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(jsonReq("PUT", { id: wl.id, name: "Hijacked" }));
    expect(res.status).toBe(404);
  });

  test("can clear description to null", async () => {
    const wl = watchlistsRepo.create({
      userId: "e2e-test-user",
      name: "Test",
      description: "Has description",
    });

    const { PUT } = await import("@/app/api/watchlists/route");
    const res = await PUT(jsonReq("PUT", { id: wl.id, description: "" }));
    const body = await res.json();
    expect(body.data.description).toBeNull();
  });
});

// =============================================================================
// DELETE /api/watchlists
// =============================================================================

describe("DELETE /api/watchlists", () => {
  test("deletes an existing watchlist", async () => {
    const wl = watchlistsRepo.create({ userId: "e2e-test-user", name: "ToDelete" });

    const { DELETE: DEL } = await import("@/app/api/watchlists/route");
    const res = await DEL(jsonReq("DELETE", undefined, `id=${wl.id}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);

    // Verify it's gone
    expect(watchlistsRepo.findByIdAndUserId(wl.id, "e2e-test-user")).toBeUndefined();
  });

  test("cascade deletes members when watchlist is deleted", async () => {
    const wl = watchlistsRepo.create({ userId: "e2e-test-user", name: "ToDelete" });
    watchlistRepo.create({
      userId: "e2e-test-user",
      watchlistId: wl.id,
      twitterUsername: "user1",
      note: null,
    });

    const { DELETE: DEL } = await import("@/app/api/watchlists/route");
    await DEL(jsonReq("DELETE", undefined, `id=${wl.id}`));

    expect(watchlistRepo.findByWatchlistId(wl.id)).toHaveLength(0);
  });

  test("returns 400 for missing id", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlists/route");
    const res = await DEL(jsonReq("DELETE"));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid id", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlists/route");
    const res = await DEL(jsonReq("DELETE", undefined, "id=abc"));
    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent watchlist", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlists/route");
    const res = await DEL(jsonReq("DELETE", undefined, "id=999"));
    expect(res.status).toBe(404);
  });

  test("returns 404 when deleting another user's watchlist", async () => {
    db.insert(users)
      .values({ id: "other-user", email: "other@example.com" })
      .run();
    const wl = watchlistsRepo.create({ userId: "other-user", name: "Secret" });

    const { DELETE: DEL } = await import("@/app/api/watchlists/route");
    const res = await DEL(jsonReq("DELETE", undefined, `id=${wl.id}`));
    expect(res.status).toBe(404);
  });
});
