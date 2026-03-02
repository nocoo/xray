import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

/** Helper: seed user + watchlist, return watchlistId */
function seedWatchlist(userId = "u1"): number {
  const scopedDb = new ScopedDB(userId);
  const wl = scopedDb.watchlists.create({ name: "Default" });
  return wl.id;
}

describe("repositories/watchlist (members)", () => {
  let wlId: number;
  let scopedDb: ScopedDB;

  beforeEach(() => {
    createTestDb();
    db.insert(users)
      .values({ id: "u1", name: "Test User", email: "test@example.com" })
      .run();
    scopedDb = new ScopedDB("u1");
    wlId = seedWatchlist();
  });

  afterEach(() => {
    closeDb();
  });

  describe("create", () => {
    test("creates a watchlist member", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "elonmusk",
        note: "SpaceX CEO",
      });
      expect(member.id).toBeDefined();
      expect(member.twitterUsername).toBe("elonmusk");
      expect(member.note).toBe("SpaceX CEO");
      expect(member.watchlistId).toBe(wlId);
      expect(member.addedAt).toBeInstanceOf(Date);
    });

    test("strips @ prefix and lowercases username", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "@ElonMusk",
        note: null,
      });
      expect(member.twitterUsername).toBe("elonmusk");
    });

    test("allows null note", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      expect(member.note).toBeNull();
    });
  });

  describe("findByWatchlistId", () => {
    test("returns empty array when no members", () => {
      expect(scopedDb.members.findByWatchlistId(wlId)).toEqual([]);
    });

    test("returns members with empty tags array", () => {
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "user1", note: null });
      const members = scopedDb.members.findByWatchlistId(wlId);
      expect(members).toHaveLength(1);
      expect(members[0]!.tags).toEqual([]);
    });

    test("scoped to watchlist", () => {
      const wl2 = scopedDb.watchlists.create({ name: "Second" });
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "user1", note: null });
      scopedDb.members.create({ watchlistId: wl2.id, twitterUsername: "user2", note: null });

      expect(scopedDb.members.findByWatchlistId(wlId)).toHaveLength(1);
      expect(scopedDb.members.findByWatchlistId(wl2.id)).toHaveLength(1);
    });

    test("same user can be in multiple watchlists", () => {
      const wl2 = scopedDb.watchlists.create({ name: "Second" });
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "elonmusk", note: null });
      scopedDb.members.create({ watchlistId: wl2.id, twitterUsername: "elonmusk", note: null });

      expect(scopedDb.members.findByWatchlistId(wlId)).toHaveLength(1);
      expect(scopedDb.members.findByWatchlistId(wl2.id)).toHaveLength(1);
    });
  });

  describe("findByUserId", () => {
    test("returns all members across watchlists", () => {
      const wl2 = scopedDb.watchlists.create({ name: "Second" });
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "user1", note: null });
      scopedDb.members.create({ watchlistId: wl2.id, twitterUsername: "user2", note: null });

      expect(scopedDb.members.findAll()).toHaveLength(2);
    });

    test("scoped to user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const scopedDb2 = new ScopedDB("u2");
      const wl2 = seedWatchlist("u2");
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "user1", note: null });
      scopedDb2.members.create({ watchlistId: wl2, twitterUsername: "user2", note: null });

      expect(scopedDb.members.findAll()).toHaveLength(1);
      expect(scopedDb2.members.findAll()).toHaveLength(1);
    });
  });

  describe("findByUsernameAndWatchlistId", () => {
    test("finds existing member", () => {
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "elonmusk", note: null });
      const found = scopedDb.members.findByUsernameAndWatchlist("elonmusk", wlId);
      expect(found).toBeDefined();
      expect(found!.twitterUsername).toBe("elonmusk");
    });

    test("returns undefined for non-existent", () => {
      expect(
        scopedDb.members.findByUsernameAndWatchlist("nobody", wlId)
      ).toBeUndefined();
    });

    test("scoped to watchlist", () => {
      const wl2 = scopedDb.watchlists.create({ name: "Second" });
      scopedDb.members.create({ watchlistId: wlId, twitterUsername: "elonmusk", note: null });

      expect(scopedDb.members.findByUsernameAndWatchlist("elonmusk", wlId)).toBeDefined();
      expect(scopedDb.members.findByUsernameAndWatchlist("elonmusk", wl2.id)).toBeUndefined();
    });
  });

  describe("updateNote", () => {
    test("updates the note", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: "original",
      });
      const updated = scopedDb.members.updateNote(member.id, "updated");
      expect(updated!.note).toBe("updated");
    });

    test("can clear note to null", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: "has note",
      });
      const updated = scopedDb.members.updateNote(member.id, null);
      expect(updated!.note).toBeNull();
    });
  });

  describe("deleteById", () => {
    test("deletes existing member", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      expect(scopedDb.members.deleteById(member.id)).toBe(true);
      expect(scopedDb.members.findByWatchlistId(wlId)).toHaveLength(0);
    });

    test("returns false for non-existent", () => {
      expect(scopedDb.members.deleteById(999)).toBe(false);
    });
  });

  describe("tag associations", () => {
    test("setTags assigns tags to a member", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag1 = scopedDb.tags.create({ name: "AI" });
      const tag2 = scopedDb.tags.create({ name: "Crypto" });

      scopedDb.members.setTags(member.id, [tag1.id, tag2.id]);

      const found = scopedDb.members.findById(member.id);
      expect(found!.tags).toHaveLength(2);
      expect(found!.tags.map((t) => t.name).sort()).toEqual(["AI", "Crypto"]);
    });

    test("setTags replaces existing tags", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag1 = scopedDb.tags.create({ name: "AI" });
      const tag2 = scopedDb.tags.create({ name: "Crypto" });

      scopedDb.members.setTags(member.id, [tag1.id]);
      scopedDb.members.setTags(member.id, [tag2.id]);

      const found = scopedDb.members.findById(member.id);
      expect(found!.tags).toHaveLength(1);
      expect(found!.tags[0]!.name).toBe("Crypto");
    });

    test("addTag adds a single tag", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = scopedDb.tags.create({ name: "AI" });

      scopedDb.members.addTag(member.id, tag.id);

      const found = scopedDb.members.findById(member.id);
      expect(found!.tags).toHaveLength(1);
    });

    test("addTag is idempotent", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = scopedDb.tags.create({ name: "AI" });

      scopedDb.members.addTag(member.id, tag.id);
      scopedDb.members.addTag(member.id, tag.id);

      const found = scopedDb.members.findById(member.id);
      expect(found!.tags).toHaveLength(1);
    });

    test("removeTag removes a single tag", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag1 = scopedDb.tags.create({ name: "AI" });
      const tag2 = scopedDb.tags.create({ name: "Crypto" });

      scopedDb.members.setTags(member.id, [tag1.id, tag2.id]);
      scopedDb.members.removeTag(member.id, tag1.id);

      const found = scopedDb.members.findById(member.id);
      expect(found!.tags).toHaveLength(1);
      expect(found!.tags[0]!.name).toBe("Crypto");
    });

    test("deleting a tag cascades to member associations", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = scopedDb.tags.create({ name: "AI" });
      scopedDb.members.addTag(member.id, tag.id);

      scopedDb.tags.deleteById(tag.id);

      const found = scopedDb.members.findById(member.id);
      expect(found!.tags).toHaveLength(0);
    });

    test("deleting a member cascades to tag associations", () => {
      const member = scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = scopedDb.tags.create({ name: "AI" });
      scopedDb.members.addTag(member.id, tag.id);

      scopedDb.members.deleteById(member.id);

      // Tag should still exist
      expect(scopedDb.tags.findAll()).toHaveLength(1);
    });

    test("deleting a watchlist cascades to members", () => {
      scopedDb.members.create({
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      scopedDb.watchlists.deleteById(wlId);
      expect(scopedDb.members.findByWatchlistId(wlId)).toHaveLength(0);
    });
  });
});
