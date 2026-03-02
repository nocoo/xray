import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

describe("repositories/watchlists", () => {
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
    test("creates a watchlist with defaults", () => {
      const wl = scopedDb.watchlists.create({ name: "AI Traders" });
      expect(wl.id).toBeDefined();
      expect(wl.userId).toBe("u1");
      expect(wl.name).toBe("AI Traders");
      expect(wl.description).toBeNull();
      expect(wl.icon).toBe("eye");
      expect(wl.translateEnabled).toBe(1);
      expect(wl.createdAt).toBeInstanceOf(Date);
    });

    test("creates with custom icon and translateEnabled", () => {
      const wl = scopedDb.watchlists.create({
        name: "Crypto",
        description: "Crypto influencers",
        icon: "bitcoin",
        translateEnabled: 0,
      });
      expect(wl.icon).toBe("bitcoin");
      expect(wl.translateEnabled).toBe(0);
      expect(wl.description).toBe("Crypto influencers");
    });

    test("allows multiple watchlists per user", () => {
      scopedDb.watchlists.create({ name: "List A" });
      scopedDb.watchlists.create({ name: "List B" });
      const all = scopedDb.watchlists.findAll();
      expect(all).toHaveLength(2);
    });
  });

  describe("findByUserId", () => {
    test("returns empty array when no watchlists", () => {
      expect(scopedDb.watchlists.findAll()).toEqual([]);
    });

    test("returns all watchlists for user", () => {
      scopedDb.watchlists.create({ name: "First" });
      scopedDb.watchlists.create({ name: "Second" });
      const all = scopedDb.watchlists.findAll();
      expect(all).toHaveLength(2);
      const names = all.map((w) => w.name).sort();
      expect(names).toEqual(["First", "Second"]);
    });

    test("scoped to user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const scopedDb2 = new ScopedDB("u2");
      scopedDb.watchlists.create({ name: "U1 List" });
      scopedDb2.watchlists.create({ name: "U2 List" });

      expect(scopedDb.watchlists.findAll()).toHaveLength(1);
      expect(scopedDb2.watchlists.findAll()).toHaveLength(1);
    });
  });

  describe("findByIdAndUserId", () => {
    test("finds owned watchlist", () => {
      const wl = scopedDb.watchlists.create({ name: "Test" });
      const found = scopedDb.watchlists.findById(wl.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Test");
    });

    test("returns undefined for wrong user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const scopedDb2 = new ScopedDB("u2");
      const wl = scopedDb.watchlists.create({ name: "Test" });
      expect(scopedDb2.watchlists.findById(wl.id)).toBeUndefined();
    });

    test("returns undefined for non-existent id", () => {
      expect(scopedDb.watchlists.findById(999)).toBeUndefined();
    });
  });

  describe("findById", () => {
    test("finds by id without ownership check", () => {
      const wl = scopedDb.watchlists.create({ name: "Test" });
      expect(scopedDb.watchlists.findById(wl.id)).toBeDefined();
    });

    test("returns undefined for non-existent", () => {
      expect(scopedDb.watchlists.findById(999)).toBeUndefined();
    });
  });

  describe("update", () => {
    test("updates name", () => {
      const wl = scopedDb.watchlists.create({ name: "Old" });
      const updated = scopedDb.watchlists.update(wl.id, { name: "New" });
      expect(updated!.name).toBe("New");
    });

    test("updates icon and translateEnabled", () => {
      const wl = scopedDb.watchlists.create({ name: "Test" });
      const updated = scopedDb.watchlists.update(wl.id, {
        icon: "radar",
        translateEnabled: 0,
      });
      expect(updated!.icon).toBe("radar");
      expect(updated!.translateEnabled).toBe(0);
    });

    test("partial update preserves other fields", () => {
      const wl = scopedDb.watchlists.create({
        name: "Test",
        icon: "brain",
        translateEnabled: 0,
      });
      const updated = scopedDb.watchlists.update(wl.id, { name: "Renamed" });
      expect(updated!.icon).toBe("brain");
      expect(updated!.translateEnabled).toBe(0);
    });

    test("returns undefined for non-existent", () => {
      expect(scopedDb.watchlists.update(999, { name: "Nope" })).toBeUndefined();
    });
  });

  describe("deleteById", () => {
    test("deletes existing watchlist", () => {
      const wl = scopedDb.watchlists.create({ name: "ToDelete" });
      expect(scopedDb.watchlists.deleteById(wl.id)).toBe(true);
      expect(scopedDb.watchlists.findAll()).toHaveLength(0);
    });

    test("returns false for non-existent", () => {
      expect(scopedDb.watchlists.deleteById(999)).toBe(false);
    });
  });
});
