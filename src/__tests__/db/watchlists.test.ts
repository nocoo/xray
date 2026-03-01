import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as watchlistsRepo from "@/db/repositories/watchlists";

describe("repositories/watchlists", () => {
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
    test("creates a watchlist with defaults", () => {
      const wl = watchlistsRepo.create({ userId: "u1", name: "AI Traders" });
      expect(wl.id).toBeDefined();
      expect(wl.userId).toBe("u1");
      expect(wl.name).toBe("AI Traders");
      expect(wl.description).toBeNull();
      expect(wl.icon).toBe("eye");
      expect(wl.translateEnabled).toBe(1);
      expect(wl.createdAt).toBeInstanceOf(Date);
    });

    test("creates with custom icon and translateEnabled", () => {
      const wl = watchlistsRepo.create({
        userId: "u1",
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
      watchlistsRepo.create({ userId: "u1", name: "List A" });
      watchlistsRepo.create({ userId: "u1", name: "List B" });
      const all = watchlistsRepo.findByUserId("u1");
      expect(all).toHaveLength(2);
    });
  });

  describe("findByUserId", () => {
    test("returns empty array when no watchlists", () => {
      expect(watchlistsRepo.findByUserId("u1")).toEqual([]);
    });

    test("returns all watchlists for user", () => {
      watchlistsRepo.create({ userId: "u1", name: "First" });
      watchlistsRepo.create({ userId: "u1", name: "Second" });
      const all = watchlistsRepo.findByUserId("u1");
      expect(all).toHaveLength(2);
      const names = all.map((w) => w.name).sort();
      expect(names).toEqual(["First", "Second"]);
    });

    test("scoped to user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      watchlistsRepo.create({ userId: "u1", name: "U1 List" });
      watchlistsRepo.create({ userId: "u2", name: "U2 List" });

      expect(watchlistsRepo.findByUserId("u1")).toHaveLength(1);
      expect(watchlistsRepo.findByUserId("u2")).toHaveLength(1);
    });
  });

  describe("findByIdAndUserId", () => {
    test("finds owned watchlist", () => {
      const wl = watchlistsRepo.create({ userId: "u1", name: "Test" });
      const found = watchlistsRepo.findByIdAndUserId(wl.id, "u1");
      expect(found).toBeDefined();
      expect(found!.name).toBe("Test");
    });

    test("returns undefined for wrong user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const wl = watchlistsRepo.create({ userId: "u1", name: "Test" });
      expect(watchlistsRepo.findByIdAndUserId(wl.id, "u2")).toBeUndefined();
    });

    test("returns undefined for non-existent id", () => {
      expect(watchlistsRepo.findByIdAndUserId(999, "u1")).toBeUndefined();
    });
  });

  describe("findById", () => {
    test("finds by id without ownership check", () => {
      const wl = watchlistsRepo.create({ userId: "u1", name: "Test" });
      expect(watchlistsRepo.findById(wl.id)).toBeDefined();
    });

    test("returns undefined for non-existent", () => {
      expect(watchlistsRepo.findById(999)).toBeUndefined();
    });
  });

  describe("update", () => {
    test("updates name", () => {
      const wl = watchlistsRepo.create({ userId: "u1", name: "Old" });
      const updated = watchlistsRepo.update(wl.id, { name: "New" });
      expect(updated!.name).toBe("New");
    });

    test("updates icon and translateEnabled", () => {
      const wl = watchlistsRepo.create({ userId: "u1", name: "Test" });
      const updated = watchlistsRepo.update(wl.id, {
        icon: "radar",
        translateEnabled: 0,
      });
      expect(updated!.icon).toBe("radar");
      expect(updated!.translateEnabled).toBe(0);
    });

    test("partial update preserves other fields", () => {
      const wl = watchlistsRepo.create({
        userId: "u1",
        name: "Test",
        icon: "brain",
        translateEnabled: 0,
      });
      const updated = watchlistsRepo.update(wl.id, { name: "Renamed" });
      expect(updated!.icon).toBe("brain");
      expect(updated!.translateEnabled).toBe(0);
    });

    test("returns undefined for non-existent", () => {
      expect(watchlistsRepo.update(999, { name: "Nope" })).toBeUndefined();
    });
  });

  describe("deleteById", () => {
    test("deletes existing watchlist", () => {
      const wl = watchlistsRepo.create({ userId: "u1", name: "ToDelete" });
      expect(watchlistsRepo.deleteById(wl.id)).toBe(true);
      expect(watchlistsRepo.findByUserId("u1")).toHaveLength(0);
    });

    test("returns false for non-existent", () => {
      expect(watchlistsRepo.deleteById(999)).toBe(false);
    });
  });
});
