import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";
import { generateTagColor } from "@/lib/tag-color";

describe("repositories/tags", () => {
  let scopedDb: ScopedDB;

  beforeEach(() => {
    createTestDb();
    db.insert(users)
      .values({ id: "u1", name: "Test User", email: "test@example.com" })
      .run();
    scopedDb = new ScopedDB("u1");
  });

  afterEach(() => {
    closeDb();
  });

  describe("create", () => {
    test("creates a tag with auto-generated color", () => {
      const tag = scopedDb.tags.create({ name: "AI Leaders" });
      expect(tag.id).toBeDefined();
      expect(tag.name).toBe("AI Leaders");
      expect(tag.color).toBe(generateTagColor("AI Leaders"));
      expect(tag.userId).toBe("u1");
    });

    test("trims whitespace from name", () => {
      const tag = scopedDb.tags.create({ name: "  Crypto  " });
      expect(tag.name).toBe("Crypto");
    });

    test("returns existing tag if same name exists (idempotent)", () => {
      const first = scopedDb.tags.create({ name: "AI" });
      const second = scopedDb.tags.create({ name: "AI" });
      expect(second.id).toBe(first.id);
    });

    test("allows same tag name for different users", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const scopedDb2 = new ScopedDB("u2");
      const t1 = scopedDb.tags.create({ name: "AI" });
      const t2 = scopedDb2.tags.create({ name: "AI" });
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe("findByUserId", () => {
    test("returns empty array when no tags exist", () => {
      expect(scopedDb.tags.findAll()).toEqual([]);
    });

    test("returns only tags for the specified user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const scopedDb2 = new ScopedDB("u2");
      scopedDb.tags.create({ name: "AI" });
      scopedDb.tags.create({ name: "Crypto" });
      scopedDb2.tags.create({ name: "Finance" });

      const u1Tags = scopedDb.tags.findAll();
      expect(u1Tags).toHaveLength(2);
      expect(u1Tags.map((t) => t.name).sort()).toEqual(["AI", "Crypto"]);
    });
  });

  describe("findByIdAndUserId", () => {
    test("returns tag when owned by user", () => {
      const tag = scopedDb.tags.create({ name: "AI" });
      const found = scopedDb.tags.findById(tag.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("AI");
    });

    test("returns undefined for wrong user", () => {
      const tag = scopedDb.tags.create({ name: "AI" });
      const otherDb = new ScopedDB("other");
      expect(otherDb.tags.findById(tag.id)).toBeUndefined();
    });
  });

  describe("deleteById", () => {
    test("deletes existing tag", () => {
      const tag = scopedDb.tags.create({ name: "AI" });
      expect(scopedDb.tags.deleteById(tag.id)).toBe(true);
      expect(scopedDb.tags.findAll()).toHaveLength(0);
    });

    test("returns false for non-existent tag", () => {
      expect(scopedDb.tags.deleteById(999)).toBe(false);
    });
  });
});

describe("tag-color", () => {
  test("generates deterministic color for same input", () => {
    expect(generateTagColor("AI")).toBe(generateTagColor("AI"));
    expect(generateTagColor("Crypto")).toBe(generateTagColor("Crypto"));
  });

  test("case-insensitive", () => {
    expect(generateTagColor("AI")).toBe(generateTagColor("ai"));
  });

  test("generates valid HSL string", () => {
    const color = generateTagColor("test");
    expect(color).toMatch(/^hsl\(\d+, 70%, 45%\)$/);
  });

  test("different names produce different colors (most of the time)", () => {
    const colors = new Set(
      ["AI", "Crypto", "Finance", "Tech", "Health", "Art"].map(generateTagColor)
    );
    // At least 3 distinct colors out of 6 names (12 hue buckets)
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
});
