import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";

// The API routes use requireAuth() which needs E2E_SKIP_AUTH for direct testing
beforeEach(() => {
  createTestDb();
  process.env.E2E_SKIP_AUTH = "true";
  // Seed the e2e user that E2E_SKIP_AUTH returns
  db.insert(users)
    .values({ id: "e2e-test-user", name: "E2E Test User", email: "e2e@test.com" })
    .run();
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
// /api/watchlist
// =============================================================================

describe("GET /api/watchlist", () => {
  test("returns empty array initially", async () => {
    const { GET } = await import("@/app/api/watchlist/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/watchlist", () => {
  test("adds a user to the watchlist", async () => {
    const { POST } = await import("@/app/api/watchlist/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: "elonmusk",
          note: "SpaceX CEO",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.twitterUsername).toBe("elonmusk");
    expect(body.data.note).toBe("SpaceX CEO");
    expect(body.data.tags).toEqual([]);
  });

  test("strips @ prefix", async () => {
    const { POST } = await import("@/app/api/watchlist/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "@TestUser" }),
      })
    );
    const body = await res.json();
    expect(body.data.twitterUsername).toBe("testuser");
  });

  test("returns 409 for duplicate username", async () => {
    const { POST } = await import("@/app/api/watchlist/route");
    const req = () =>
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "elonmusk" }),
      });

    await POST(req());
    const res = await POST(req());
    expect(res.status).toBe(409);
  });

  test("returns 400 for missing username", async () => {
    const { POST } = await import("@/app/api/watchlist/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
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
    const { POST } = await import("@/app/api/watchlist/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: "openai",
          tagIds: [tag.id],
        }),
      })
    );
    const body = await res.json();
    expect(body.data.tags).toHaveLength(1);
    expect(body.data.tags[0].name).toBe("AI");
  });
});

describe("PUT /api/watchlist", () => {
  test("updates note and tags", async () => {
    const { POST, PUT } = await import("@/app/api/watchlist/route");
    const { POST: createTag } = await import("@/app/api/tags/route");

    // Create member
    const createRes = await POST(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "user1" }),
      })
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
      new Request("http://localhost/api/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          note: "Updated note",
          tagIds: [tag.id],
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.note).toBe("Updated note");
    expect(body.data.tags).toHaveLength(1);
  });

  test("returns 404 for non-existent member", async () => {
    const { PUT } = await import("@/app/api/watchlist/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 999, note: "test" }),
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/watchlist", () => {
  test("deletes an existing member", async () => {
    const { POST, DELETE: DEL } = await import("@/app/api/watchlist/route");

    // Create first
    const createRes = await POST(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitterUsername: "toremove" }),
      })
    );
    const { data: member } = await createRes.json();

    // Delete
    const res = await DEL(
      new Request(`http://localhost/api/watchlist?id=${member.id}`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(200);
  });

  test("returns 404 for non-existent member", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlist/route");
    const res = await DEL(
      new Request("http://localhost/api/watchlist?id=999", { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });

  test("returns 400 for missing id", async () => {
    const { DELETE: DEL } = await import("@/app/api/watchlist/route");
    const res = await DEL(
      new Request("http://localhost/api/watchlist", { method: "DELETE" })
    );
    expect(res.status).toBe(400);
  });
});
