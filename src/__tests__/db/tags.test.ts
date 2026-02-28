import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as tagsRepo from "@/db/repositories/tags";
import { generateTagColor } from "@/lib/tag-color";

describe("repositories/tags", () => {
  beforeEach(() => {
    createTestDb();
    db.insert(users)
      .values({ id: "u1", name: "Test User", email: "test@example.com" })
      .run();
  });

  afterEach(() => {
    closeDb();
  });

  describe("create", () => {
    test("creates a tag with auto-generated color", () => {
      const tag = tagsRepo.create({ userId: "u1", name: "AI Leaders" });
      expect(tag.id).toBeDefined();
      expect(tag.name).toBe("AI Leaders");
      expect(tag.color).toBe(generateTagColor("AI Leaders"));
      expect(tag.userId).toBe("u1");
    });

    test("trims whitespace from name", () => {
      const tag = tagsRepo.create({ userId: "u1", name: "  Crypto  " });
      expect(tag.name).toBe("Crypto");
    });

    test("returns existing tag if same name exists (idempotent)", () => {
      const first = tagsRepo.create({ userId: "u1", name: "AI" });
      const second = tagsRepo.create({ userId: "u1", name: "AI" });
      expect(second.id).toBe(first.id);
    });

    test("allows same tag name for different users", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const t1 = tagsRepo.create({ userId: "u1", name: "AI" });
      const t2 = tagsRepo.create({ userId: "u2", name: "AI" });
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe("findByUserId", () => {
    test("returns empty array when no tags exist", () => {
      expect(tagsRepo.findByUserId("u1")).toEqual([]);
    });

    test("returns only tags for the specified user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      tagsRepo.create({ userId: "u1", name: "AI" });
      tagsRepo.create({ userId: "u1", name: "Crypto" });
      tagsRepo.create({ userId: "u2", name: "Finance" });

      const u1Tags = tagsRepo.findByUserId("u1");
      expect(u1Tags).toHaveLength(2);
      expect(u1Tags.map((t) => t.name).sort()).toEqual(["AI", "Crypto"]);
    });
  });

  describe("findByIdAndUserId", () => {
    test("returns tag when owned by user", () => {
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });
      const found = tagsRepo.findByIdAndUserId(tag.id, "u1");
      expect(found).toBeDefined();
      expect(found!.name).toBe("AI");
    });

    test("returns undefined for wrong user", () => {
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });
      expect(tagsRepo.findByIdAndUserId(tag.id, "other")).toBeUndefined();
    });
  });

  describe("deleteById", () => {
    test("deletes existing tag", () => {
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });
      expect(tagsRepo.deleteById(tag.id)).toBe(true);
      expect(tagsRepo.findByUserId("u1")).toHaveLength(0);
    });

    test("returns false for non-existent tag", () => {
      expect(tagsRepo.deleteById(999)).toBe(false);
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
