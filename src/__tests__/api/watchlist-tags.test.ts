import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as watchlistsRepo from "@/db/repositories/watchlists";

// The API routes use requireAuth() which needs E2E_SKIP_AUTH for direct testing
let watchlistId: number;

function ctx(id?: number) {
  return { params: Promise.resolve({ id: String(id ?? watchlistId) }) };
}

beforeEach(() => {
  createTestDb();
  process.env.E2E_SKIP_AUTH = "true";
  // Seed the e2e user that E2E_SKIP_AUTH returns
  db.insert(users)
    .values({ id: "e2e-test-user", name: "E2E Test User", email: "e2e@test.com" })
    .run();
  // Create a default watchlist for member tests
  const wl = watchlistsRepo.create({ userId: "e2e-test-user", name: "Test WL" });
  watchlistId = wl.id;
});

afterEach(() => {
  closeDb();
  delete process.env.E2E_SKIP_AUTH;
});

// =============================================================================
// /api/tags
// =============================================================================

describe("GET /api/tags", () => {
  test("returns empty array initially", async () => {
    const { GET } = await import("@/app/api/tags/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/tags", () => {
  test("creates a new tag", async () => {
    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "AI Leaders" }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("AI Leaders");
    expect(body.data.color).toMatch(/^hsl\(/);
  });

  test("returns 400 for missing name", async () => {
    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/tags", () => {
  test("deletes an existing tag", async () => {
    const { POST, DELETE: DEL } = await import("@/app/api/tags/route");

    // Create first
    const createRes = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ToDelete" }),
      })
    );
    const { data: tag } = await createRes.json();

    // Delete
    const res = await DEL(
      new Request(`http://localhost/api/tags?id=${tag.id}`, { method: "DELETE" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("returns 404 for non-existent tag", async () => {
    const { DELETE: DEL } = await import("@/app/api/tags/route");
    const res = await DEL(
      new Request("http://localhost/api/tags?id=999", { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// /api/watchlists/[id]/members
// =============================================================================

describe("GET /api/watchlists/[id]/members", () => {
  test("returns empty array initially", async () => {
    const { GET } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/watchlists/[id]/members", () => {
  test("adds a user to the watchlist", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: "elonmusk",
          note: "SpaceX CEO",
        }),
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.twitterUsername).toBe("elonmusk");
    expect(body.data.note).toBe("SpaceX CEO");
    expect(body.data.tags).toEqual([]);
  });

  test("strips @ prefix", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "@TestUser" }),
      }),
      ctx(),
    );
    const body = await res.json();
    expect(body.data.twitterUsername).toBe("testuser");
  });

  test("returns 409 for duplicate username", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/members/route");
    const req = () =>
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "elonmusk" }),
      });

    await POST(req(), ctx());
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
  });

  test("returns 400 for missing username", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  test("creates member with tags", async () => {
    // Create a tag first
    const { POST: createTag } = await import("@/app/api/tags/route");
    const tagRes = await createTag(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "AI" }),
      })
    );
    const { data: tag } = await tagRes.json();

    // Add member with tag
    const { POST } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: "openai",
          tagIds: [tag.id],
        }),
      }),
      ctx(),
    );
    const body = await res.json();
    expect(body.data.tags).toHaveLength(1);
    expect(body.data.tags[0].name).toBe("AI");
  });
});

describe("PUT /api/watchlists/[id]/members", () => {
  test("updates note and tags", async () => {
    const { POST, PUT } = await import("@/app/api/watchlists/[id]/members/route");
    const { POST: createTag } = await import("@/app/api/tags/route");

    // Create member
    const createRes = await POST(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "user1" }),
      }),
      ctx(),
    );
    const { data: member } = await createRes.json();

    // Create tag
    const tagRes = await createTag(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Crypto" }),
      })
    );
    const { data: tag } = await tagRes.json();

    // Update
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          note: "Updated note",
          tagIds: [tag.id],
        }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.note).toBe("Updated note");
    expect(body.data.tags).toHaveLength(1);
  });

  test("returns 404 for non-existent member", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 999, note: "test" }),
      }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/watchlists/[id]/members", () => {
  test("deletes an existing member", async () => {
    const { POST, DELETE: DEL } = await import("@/app/api/watchlists/[id]/members/route");

    // Create first
    const createRes = await POST(
      new Request("http://localhost/api/watchlists/1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "toremove" }),
      }),
      ctx(),
    );
    const { data: member } = await createRes.json();

    // Delete
    const res = await DEL(
      new Request(`http://localhost/api/watchlists/1/members?id=${member.id}`, {
        method: "DELETE",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  test("returns 404 for non-existent member", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await DEL(
      new Request("http://localhost/api/watchlists/1/members?id=999", { method: "DELETE" }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  test("returns 400 for missing id", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlists/[id]/members/route");
    const res = await DEL(
      new Request("http://localhost/api/watchlists/1/members", { method: "DELETE" }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });
});
