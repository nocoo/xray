import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as watchlistRepo from "@/db/repositories/watchlist";
import * as watchlistsRepo from "@/db/repositories/watchlists";
import * as tagsRepo from "@/db/repositories/tags";

/** Helper: seed user + watchlist, return watchlistId */
function seedWatchlist(userId = "u1"): number {
  const wl = watchlistsRepo.create({ userId, name: "Default" });
  return wl.id;
}

describe("repositories/watchlist (members)", () => {
  let wlId: number;

  beforeEach(() => {
    createTestDb();
    db.insert(users)
      .values({ id: "u1", name: "Test User", email: "test@example.com" })
      .run();
    wlId = seedWatchlist();
  });

  afterEach(() => {
    closeDb();
  });

  describe("create", () => {
    test("creates a watchlist member", () => {
      const member = watchlistRepo.create({
        userId: "u1",
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
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "@ElonMusk",
        note: null,
      });
      expect(member.twitterUsername).toBe("elonmusk");
    });

    test("allows null note", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      expect(member.note).toBeNull();
    });
  });

  describe("findByWatchlistId", () => {
    test("returns empty array when no members", () => {
      expect(watchlistRepo.findByWatchlistId(wlId)).toEqual([]);
    });

    test("returns members with empty tags array", () => {
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "user1", note: null });
      const members = watchlistRepo.findByWatchlistId(wlId);
      expect(members).toHaveLength(1);
      expect(members[0]!.tags).toEqual([]);
    });

    test("scoped to watchlist", () => {
      const wl2 = watchlistsRepo.create({ userId: "u1", name: "Second" });
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "user1", note: null });
      watchlistRepo.create({ userId: "u1", watchlistId: wl2.id, twitterUsername: "user2", note: null });

      expect(watchlistRepo.findByWatchlistId(wlId)).toHaveLength(1);
      expect(watchlistRepo.findByWatchlistId(wl2.id)).toHaveLength(1);
    });

    test("same user can be in multiple watchlists", () => {
      const wl2 = watchlistsRepo.create({ userId: "u1", name: "Second" });
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "elonmusk", note: null });
      watchlistRepo.create({ userId: "u1", watchlistId: wl2.id, twitterUsername: "elonmusk", note: null });

      expect(watchlistRepo.findByWatchlistId(wlId)).toHaveLength(1);
      expect(watchlistRepo.findByWatchlistId(wl2.id)).toHaveLength(1);
    });
  });

  describe("findByUserId", () => {
    test("returns all members across watchlists", () => {
      const wl2 = watchlistsRepo.create({ userId: "u1", name: "Second" });
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "user1", note: null });
      watchlistRepo.create({ userId: "u1", watchlistId: wl2.id, twitterUsername: "user2", note: null });

      expect(watchlistRepo.findByUserId("u1")).toHaveLength(2);
    });

    test("scoped to user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();
      const wl2 = seedWatchlist("u2");
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "user1", note: null });
      watchlistRepo.create({ userId: "u2", watchlistId: wl2, twitterUsername: "user2", note: null });

      expect(watchlistRepo.findByUserId("u1")).toHaveLength(1);
      expect(watchlistRepo.findByUserId("u2")).toHaveLength(1);
    });
  });

  describe("findByUsernameAndWatchlistId", () => {
    test("finds existing member", () => {
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "elonmusk", note: null });
      const found = watchlistRepo.findByUsernameAndWatchlistId("elonmusk", wlId);
      expect(found).toBeDefined();
      expect(found!.twitterUsername).toBe("elonmusk");
    });

    test("returns undefined for non-existent", () => {
      expect(
        watchlistRepo.findByUsernameAndWatchlistId("nobody", wlId)
      ).toBeUndefined();
    });

    test("scoped to watchlist", () => {
      const wl2 = watchlistsRepo.create({ userId: "u1", name: "Second" });
      watchlistRepo.create({ userId: "u1", watchlistId: wlId, twitterUsername: "elonmusk", note: null });

      expect(watchlistRepo.findByUsernameAndWatchlistId("elonmusk", wlId)).toBeDefined();
      expect(watchlistRepo.findByUsernameAndWatchlistId("elonmusk", wl2.id)).toBeUndefined();
    });
  });

  describe("updateNote", () => {
    test("updates the note", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: "original",
      });
      const updated = watchlistRepo.updateNote(member.id, "updated");
      expect(updated!.note).toBe("updated");
    });

    test("can clear note to null", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: "has note",
      });
      const updated = watchlistRepo.updateNote(member.id, null);
      expect(updated!.note).toBeNull();
    });
  });

  describe("deleteById", () => {
    test("deletes existing member", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      expect(watchlistRepo.deleteById(member.id)).toBe(true);
      expect(watchlistRepo.findByWatchlistId(wlId)).toHaveLength(0);
    });

    test("returns false for non-existent", () => {
      expect(watchlistRepo.deleteById(999)).toBe(false);
    });
  });

  describe("tag associations", () => {
    test("setTags assigns tags to a member", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag1 = tagsRepo.create({ userId: "u1", name: "AI" });
      const tag2 = tagsRepo.create({ userId: "u1", name: "Crypto" });

      watchlistRepo.setTags(member.id, [tag1.id, tag2.id]);

      const found = watchlistRepo.findByIdAndUserId(member.id, "u1");
      expect(found!.tags).toHaveLength(2);
      expect(found!.tags.map((t) => t.name).sort()).toEqual(["AI", "Crypto"]);
    });

    test("setTags replaces existing tags", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag1 = tagsRepo.create({ userId: "u1", name: "AI" });
      const tag2 = tagsRepo.create({ userId: "u1", name: "Crypto" });

      watchlistRepo.setTags(member.id, [tag1.id]);
      watchlistRepo.setTags(member.id, [tag2.id]);

      const found = watchlistRepo.findByIdAndUserId(member.id, "u1");
      expect(found!.tags).toHaveLength(1);
      expect(found!.tags[0]!.name).toBe("Crypto");
    });

    test("addTag adds a single tag", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });

      watchlistRepo.addTag(member.id, tag.id);

      const found = watchlistRepo.findByIdAndUserId(member.id, "u1");
      expect(found!.tags).toHaveLength(1);
    });

    test("addTag is idempotent", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });

      watchlistRepo.addTag(member.id, tag.id);
      watchlistRepo.addTag(member.id, tag.id);

      const found = watchlistRepo.findByIdAndUserId(member.id, "u1");
      expect(found!.tags).toHaveLength(1);
    });

    test("removeTag removes a single tag", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag1 = tagsRepo.create({ userId: "u1", name: "AI" });
      const tag2 = tagsRepo.create({ userId: "u1", name: "Crypto" });

      watchlistRepo.setTags(member.id, [tag1.id, tag2.id]);
      watchlistRepo.removeTag(member.id, tag1.id);

      const found = watchlistRepo.findByIdAndUserId(member.id, "u1");
      expect(found!.tags).toHaveLength(1);
      expect(found!.tags[0]!.name).toBe("Crypto");
    });

    test("deleting a tag cascades to member associations", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });
      watchlistRepo.addTag(member.id, tag.id);

      tagsRepo.deleteById(tag.id);

      const found = watchlistRepo.findByIdAndUserId(member.id, "u1");
      expect(found!.tags).toHaveLength(0);
    });

    test("deleting a member cascades to tag associations", () => {
      const member = watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      const tag = tagsRepo.create({ userId: "u1", name: "AI" });
      watchlistRepo.addTag(member.id, tag.id);

      watchlistRepo.deleteById(member.id);

      // Tag should still exist
      expect(tagsRepo.findByUserId("u1")).toHaveLength(1);
    });

    test("deleting a watchlist cascades to members", () => {
      watchlistRepo.create({
        userId: "u1",
        watchlistId: wlId,
        twitterUsername: "user1",
        note: null,
      });
      watchlistsRepo.deleteById(wlId);
      expect(watchlistRepo.findByWatchlistId(wlId)).toHaveLength(0);
    });
  });
});
