import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

// =============================================================================
// Helpers
// =============================================================================

function seedUser(id = "u1") {
  db.insert(users)
    .values({ id, name: "Test User", email: `${id}@example.com` })
    .run();
}

function seedWatchlist(userId = "u1", name = "Default") {
  const scopedDb = new ScopedDB(userId);
  return scopedDb.watchlists.create({ name });
}

function seedMember(userId: string, watchlistId: number, username = "elonmusk") {
  const scopedDb = new ScopedDB(userId);
  return scopedDb.members.create({
    watchlistId,
    twitterUsername: username,
    note: null,
  });
}

function makePostData(
  watchlistId: number,
  memberId: number,
  tweetId: string,
  username = "elonmusk",
) {
  return {
    watchlistId,
    memberId,
    tweetId,
    twitterUsername: username,
    text: `Tweet ${tweetId} content`,
    tweetJson: JSON.stringify({ id: tweetId, text: `Tweet ${tweetId} content` }),
    tweetCreatedAt: "2026-01-15T12:00:00.000Z",
  };
}

/** Insert a single post via insertMany, return the first matching row. */
function insertOne(
  scopedDb: ScopedDB,
  watchlistId: number,
  memberId: number,
  tweetId: string,
  username = "elonmusk",
) {
  const data = makePostData(watchlistId, memberId, tweetId, username);
  scopedDb.posts.insertMany([data]);
  const posts = scopedDb.posts.findByWatchlistId(watchlistId);
  return posts.find((p) => p.tweetId === tweetId)!;
}

// =============================================================================
// Tests
// =============================================================================

describe("repositories/fetched-posts", () => {
  let wlId: number;
  let scopedDb: ScopedDB;

  beforeEach(() => {
    createTestDb();
    seedUser("u1");
    scopedDb = new ScopedDB("u1");
    wlId = seedWatchlist("u1").id;
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // insertMany & deduplication
  // ---------------------------------------------------------------------------

  describe("insertMany", () => {
    test("inserts a new post", () => {
      const member = seedMember("u1", wlId);
      const data = makePostData(wlId, member.id, "tweet-001");

      const count = scopedDb.posts.insertMany([data]);
      expect(count).toBe(1);

      const posts = scopedDb.posts.findByWatchlistId(wlId);
      expect(posts).toHaveLength(1);
      expect(posts[0]!.tweetId).toBe("tweet-001");
      expect(posts[0]!.text).toBe("Tweet tweet-001 content");
      expect(posts[0]!.translatedText).toBeNull();
      expect(posts[0]!.translatedAt).toBeNull();
      expect(posts[0]!.fetchedAt).toBeInstanceOf(Date);
    });

    test("skips duplicate tweet (same watchlist + tweetId)", () => {
      const member = seedMember("u1", wlId);
      const data = makePostData(wlId, member.id, "tweet-001");

      scopedDb.posts.insertMany([data]);
      const count = scopedDb.posts.insertMany([data]);
      expect(count).toBe(0);

      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(1);
    });

    test("allows same tweetId in different watchlists", () => {
      const wl2 = seedWatchlist("u1", "Second");
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wl2.id, "user1");

      const c1 = scopedDb.posts.insertMany([makePostData(wlId, m1.id, "tweet-001", "user1")]);
      const c2 = scopedDb.posts.insertMany([makePostData(wl2.id, m2.id, "tweet-001", "user1")]);

      expect(c1).toBe(1);
      expect(c2).toBe(1);
    });

    test("inserts multiple posts, returns count of new inserts", () => {
      const member = seedMember("u1", wlId);
      const posts = [
        makePostData(wlId, member.id, "t1"),
        makePostData(wlId, member.id, "t2"),
        makePostData(wlId, member.id, "t3"),
      ];

      const count = scopedDb.posts.insertMany(posts);
      expect(count).toBe(3);
    });

    test("skips duplicates in batch", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([makePostData(wlId, member.id, "t1")]);

      const posts = [
        makePostData(wlId, member.id, "t1"), // dup
        makePostData(wlId, member.id, "t2"), // new
      ];

      const count = scopedDb.posts.insertMany(posts);
      expect(count).toBe(1);
    });

    test("returns 0 for empty array", () => {
      expect(scopedDb.posts.insertMany([])).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // findByWatchlistId
  // ---------------------------------------------------------------------------

  describe("findByWatchlistId", () => {
    test("returns empty array when no posts", () => {
      expect(scopedDb.posts.findByWatchlistId(wlId)).toEqual([]);
    });

    test("returns posts ordered by tweetCreatedAt desc", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        { ...makePostData(wlId, member.id, "t1"), tweetCreatedAt: "2026-01-10T00:00:00Z" },
        { ...makePostData(wlId, member.id, "t2"), tweetCreatedAt: "2026-01-15T00:00:00Z" },
        { ...makePostData(wlId, member.id, "t3"), tweetCreatedAt: "2026-01-12T00:00:00Z" },
      ]);

      const posts = scopedDb.posts.findByWatchlistId(wlId);
      expect(posts).toHaveLength(3);
      expect(posts[0]!.tweetId).toBe("t2");
      expect(posts[1]!.tweetId).toBe("t3");
      expect(posts[2]!.tweetId).toBe("t1");
    });

    test("respects limit parameter", () => {
      const member = seedMember("u1", wlId);
      const posts = Array.from({ length: 5 }, (_, i) =>
        makePostData(wlId, member.id, `t${i}`),
      );
      scopedDb.posts.insertMany(posts);

      const result = scopedDb.posts.findByWatchlistId(wlId, 2);
      expect(result).toHaveLength(2);
    });

    test("scoped to watchlist", () => {
      const wl2 = seedWatchlist("u1", "Second");
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wl2.id, "user2");
      scopedDb.posts.insertMany([makePostData(wlId, m1.id, "t1", "user1")]);
      scopedDb.posts.insertMany([makePostData(wl2.id, m2.id, "t2", "user2")]);

      expect(scopedDb.posts.findByWatchlistId(wlId)).toHaveLength(1);
      expect(scopedDb.posts.findByWatchlistId(wl2.id)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // findByMemberId
  // ---------------------------------------------------------------------------

  describe("findByMemberId", () => {
    test("returns posts for specific member", () => {
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wlId, "user2");

      scopedDb.posts.insertMany([
        makePostData(wlId, m1.id, "t1", "user1"),
        makePostData(wlId, m2.id, "t2", "user2"),
      ]);

      const posts = scopedDb.posts.findByMemberId(m1.id, wlId);
      expect(posts).toHaveLength(1);
      expect(posts[0]!.twitterUsername).toBe("user1");
    });

    test("returns empty for non-existent member", () => {
      expect(scopedDb.posts.findByMemberId(999, wlId)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findUntranslated
  // ---------------------------------------------------------------------------

  describe("findUntranslated", () => {
    test("returns posts with null translatedText", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        makePostData(wlId, member.id, "t1"),
        makePostData(wlId, member.id, "t2"),
      ]);

      const untranslated = scopedDb.posts.findUntranslated(wlId);
      expect(untranslated).toHaveLength(2);
    });

    test("excludes translated posts", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        makePostData(wlId, member.id, "t1"),
        makePostData(wlId, member.id, "t2"),
      ]);
      const post = scopedDb.posts.findByWatchlistId(wlId).find((p) => p.tweetId === "t1")!;

      scopedDb.posts.updateTranslation(post.id, "翻译后的文本", "锐评文本");

      const untranslated = scopedDb.posts.findUntranslated(wlId);
      expect(untranslated).toHaveLength(1);
      expect(untranslated[0]!.tweetId).toBe("t2");
    });

    test("respects limit", () => {
      const member = seedMember("u1", wlId);
      const posts = Array.from({ length: 5 }, (_, i) =>
        makePostData(wlId, member.id, `t${i}`),
      );
      scopedDb.posts.insertMany(posts);

      const untranslated = scopedDb.posts.findUntranslated(wlId, 2);
      expect(untranslated).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // updateTranslation
  // ---------------------------------------------------------------------------

  describe("updateTranslation", () => {
    test("updates translatedText and translatedAt", () => {
      const member = seedMember("u1", wlId);
      const post = insertOne(scopedDb, wlId, member.id, "t1");

      const updated = scopedDb.posts.updateTranslation(post.id, "这是翻译", "这是锐评");
      expect(updated).toBeDefined();
      expect(updated!.translatedText).toBe("这是翻译");
      expect(updated!.commentText).toBe("这是锐评");
      expect(updated!.translatedAt).toBeInstanceOf(Date);
    });

    test("returns undefined for non-existent post", () => {
      const updated = scopedDb.posts.updateTranslation(999, "text", "comment");
      expect(updated).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteByWatchlistId
  // ---------------------------------------------------------------------------

  describe("deleteByWatchlistId", () => {
    test("deletes all posts for a watchlist", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        makePostData(wlId, member.id, "t1"),
        makePostData(wlId, member.id, "t2"),
      ]);

      const deleted = scopedDb.posts.deleteByWatchlistId(wlId);
      expect(deleted).toBe(2);
      expect(scopedDb.posts.findByWatchlistId(wlId)).toEqual([]);
    });

    test("returns 0 when no posts to delete", () => {
      expect(scopedDb.posts.deleteByWatchlistId(wlId)).toBe(0);
    });

    test("does not affect other watchlists", () => {
      const wl2 = seedWatchlist("u1", "Second");
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wl2.id, "user2");
      scopedDb.posts.insertMany([makePostData(wlId, m1.id, "t1", "user1")]);
      scopedDb.posts.insertMany([makePostData(wl2.id, m2.id, "t2", "user2")]);

      scopedDb.posts.deleteByWatchlistId(wlId);
      expect(scopedDb.posts.findByWatchlistId(wl2.id)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // countByWatchlistId & countUntranslated
  // ---------------------------------------------------------------------------

  describe("countByWatchlistId", () => {
    test("returns 0 when no posts", () => {
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(0);
    });

    test("returns correct count", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        makePostData(wlId, member.id, "t1"),
        makePostData(wlId, member.id, "t2"),
      ]);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(2);
    });
  });

  describe("countUntranslated", () => {
    test("returns 0 when no posts", () => {
      expect(scopedDb.posts.countUntranslated(wlId)).toBe(0);
    });

    test("returns correct count excluding translated", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        makePostData(wlId, member.id, "t1"),
        makePostData(wlId, member.id, "t2"),
      ]);
      const p1 = scopedDb.posts.findByWatchlistId(wlId).find((p) => p.tweetId === "t1")!;

      scopedDb.posts.updateTranslation(p1.id, "翻译", "锐评");

      expect(scopedDb.posts.countUntranslated(wlId)).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // purgeOlderThan
  // ---------------------------------------------------------------------------

  describe("purgeOlderThan", () => {
    test("deletes posts with tweetCreatedAt before cutoff", () => {
      const member = seedMember("u1", wlId);

      scopedDb.posts.insertMany([
        { ...makePostData(wlId, member.id, "old-tweet"), tweetCreatedAt: "2026-01-01T00:00:00.000Z" },
        { ...makePostData(wlId, member.id, "recent-tweet"), tweetCreatedAt: "2026-02-27T00:00:00.000Z" },
      ]);

      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(2);

      const purged = scopedDb.posts.purgeOlderThan(wlId, "2026-02-01T00:00:00.000Z");
      expect(purged).toBe(1);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(1);

      const remaining = scopedDb.posts.findByWatchlistId(wlId);
      expect(remaining[0]!.tweetId).toBe("recent-tweet");
    });

    test("returns 0 when no posts match cutoff", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        { ...makePostData(wlId, member.id, "recent"), tweetCreatedAt: "2026-02-27T00:00:00.000Z" },
      ]);

      const purged = scopedDb.posts.purgeOlderThan(wlId, "2026-01-01T00:00:00.000Z");
      expect(purged).toBe(0);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(1);
    });

    test("returns 0 when no posts exist", () => {
      const purged = scopedDb.posts.purgeOlderThan(wlId, "2026-02-28T00:00:00.000Z");
      expect(purged).toBe(0);
    });

    test("is scoped to watchlist", () => {
      const wl2 = seedWatchlist("u1", "Second");
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wl2.id, "user2");

      scopedDb.posts.insertMany([
        { ...makePostData(wlId, m1.id, "old1", "user1"), tweetCreatedAt: "2026-01-01T00:00:00.000Z" },
      ]);
      scopedDb.posts.insertMany([
        { ...makePostData(wl2.id, m2.id, "old2", "user2"), tweetCreatedAt: "2026-01-01T00:00:00.000Z" },
      ]);

      const purged = scopedDb.posts.purgeOlderThan(wlId, "2026-02-01T00:00:00.000Z");
      expect(purged).toBe(1);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(0);
      expect(scopedDb.posts.countByWatchlistId(wl2.id)).toBe(1);
    });

    test("purges all posts when cutoff is in the future", () => {
      const member = seedMember("u1", wlId);
      scopedDb.posts.insertMany([
        { ...makePostData(wlId, member.id, "t1"), tweetCreatedAt: "2026-02-27T00:00:00.000Z" },
        { ...makePostData(wlId, member.id, "t2"), tweetCreatedAt: "2026-02-28T00:00:00.000Z" },
      ]);

      const purged = scopedDb.posts.purgeOlderThan(wlId, "2026-12-31T00:00:00.000Z");
      expect(purged).toBe(2);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // purgeOrphaned
  // ---------------------------------------------------------------------------

  describe("purgeOrphaned", () => {
    test("deletes posts whose memberId is not in activeMemberIds", () => {
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wlId, "user2");

      scopedDb.posts.insertMany([
        makePostData(wlId, m1.id, "t1", "user1"),
        makePostData(wlId, m2.id, "t2", "user2"),
      ]);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(2);

      const purged = scopedDb.posts.purgeOrphaned(wlId, [m1.id]);
      expect(purged).toBe(1);

      const remaining = scopedDb.posts.findByWatchlistId(wlId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.twitterUsername).toBe("user1");
    });

    test("deletes all posts when activeMemberIds is empty", () => {
      const m1 = seedMember("u1", wlId, "user1");
      scopedDb.posts.insertMany([
        makePostData(wlId, m1.id, "t1", "user1"),
        makePostData(wlId, m1.id, "t2", "user1"),
      ]);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(2);

      const purged = scopedDb.posts.purgeOrphaned(wlId, []);
      expect(purged).toBe(2);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(0);
    });

    test("returns 0 when all posts belong to active members", () => {
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wlId, "user2");

      scopedDb.posts.insertMany([
        makePostData(wlId, m1.id, "t1", "user1"),
        makePostData(wlId, m2.id, "t2", "user2"),
      ]);

      const purged = scopedDb.posts.purgeOrphaned(wlId, [m1.id, m2.id]);
      expect(purged).toBe(0);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(2);
    });

    test("returns 0 when no posts exist", () => {
      const purged = scopedDb.posts.purgeOrphaned(wlId, [1, 2]);
      expect(purged).toBe(0);
    });

    test("is scoped to watchlist — does not delete other watchlist's orphans", () => {
      const wl2 = seedWatchlist("u1", "Second");
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wl2.id, "user2");

      scopedDb.posts.insertMany([makePostData(wlId, m1.id, "t1", "user1")]);
      scopedDb.posts.insertMany([makePostData(wl2.id, m2.id, "t2", "user2")]);

      const purged = scopedDb.posts.purgeOrphaned(wlId, []);
      expect(purged).toBe(1);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(0);
      expect(scopedDb.posts.countByWatchlistId(wl2.id)).toBe(1);
    });

    test("handles multiple orphaned members correctly", () => {
      const m1 = seedMember("u1", wlId, "user1");
      const m2 = seedMember("u1", wlId, "user2");
      const m3 = seedMember("u1", wlId, "user3");

      scopedDb.posts.insertMany([
        makePostData(wlId, m1.id, "t1", "user1"),
        makePostData(wlId, m2.id, "t2", "user2"),
        makePostData(wlId, m2.id, "t3", "user2"),
        makePostData(wlId, m3.id, "t4", "user3"),
        makePostData(wlId, m3.id, "t5", "user3"),
      ]);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(5);

      const purged = scopedDb.posts.purgeOrphaned(wlId, [m1.id]);
      expect(purged).toBe(4);
      expect(scopedDb.posts.countByWatchlistId(wlId)).toBe(1);
    });
  });
});
