import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users, watchlistMembers } from "@/db/schema";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";

// =============================================================================
// Helpers
// =============================================================================

function seedUser(id = "u1") {
  db.insert(users)
    .values({ id, name: "Test User", email: `${id}@example.com` })
    .run();
}

function seedMember(userId = "u1", username = "elonmusk") {
  return db
    .insert(watchlistMembers)
    .values({
      userId,
      twitterUsername: username,
      note: null,
      addedAt: new Date(),
    })
    .returning()
    .get();
}

function makePostData(
  userId: string,
  memberId: number,
  tweetId: string,
  username = "elonmusk",
) {
  return {
    userId,
    memberId,
    tweetId,
    twitterUsername: username,
    text: `Tweet ${tweetId} content`,
    tweetJson: JSON.stringify({ id: tweetId, text: `Tweet ${tweetId} content` }),
    tweetCreatedAt: "2026-01-15T12:00:00.000Z",
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("repositories/fetched-posts", () => {
  beforeEach(() => {
    createTestDb();
    seedUser("u1");
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // insertIfNew & deduplication
  // ---------------------------------------------------------------------------

  describe("insertIfNew", () => {
    test("inserts a new post and returns it", () => {
      const member = seedMember("u1");
      const data = makePostData("u1", member.id, "tweet-001");

      const result = fetchedPostsRepo.insertIfNew(data);
      expect(result).not.toBeNull();
      expect(result!.id).toBeGreaterThan(0);
      expect(result!.tweetId).toBe("tweet-001");
      expect(result!.text).toBe("Tweet tweet-001 content");
      expect(result!.translatedText).toBeNull();
      expect(result!.translatedAt).toBeNull();
      expect(result!.fetchedAt).toBeInstanceOf(Date);
    });

    test("returns null for duplicate tweet (same user + tweetId)", () => {
      const member = seedMember("u1");
      const data = makePostData("u1", member.id, "tweet-001");

      fetchedPostsRepo.insertIfNew(data);
      const dup = fetchedPostsRepo.insertIfNew(data);
      expect(dup).toBeNull();
    });

    test("allows same tweetId for different users", () => {
      seedUser("u2");
      const m1 = seedMember("u1", "user1");
      const m2 = seedMember("u2", "user2");

      const r1 = fetchedPostsRepo.insertIfNew(makePostData("u1", m1.id, "tweet-001", "user1"));
      const r2 = fetchedPostsRepo.insertIfNew(makePostData("u2", m2.id, "tweet-001", "user2"));

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // insertMany
  // ---------------------------------------------------------------------------

  describe("insertMany", () => {
    test("inserts multiple posts, returns count of new inserts", () => {
      const member = seedMember("u1");
      const posts = [
        makePostData("u1", member.id, "t1"),
        makePostData("u1", member.id, "t2"),
        makePostData("u1", member.id, "t3"),
      ];

      const count = fetchedPostsRepo.insertMany(posts);
      expect(count).toBe(3);
    });

    test("skips duplicates in batch", () => {
      const member = seedMember("u1");
      // Insert one first
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"));

      const posts = [
        makePostData("u1", member.id, "t1"), // dup
        makePostData("u1", member.id, "t2"), // new
      ];

      const count = fetchedPostsRepo.insertMany(posts);
      expect(count).toBe(1);
    });

    test("returns 0 for empty array", () => {
      expect(fetchedPostsRepo.insertMany([])).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // existsByTweetId
  // ---------------------------------------------------------------------------

  describe("existsByTweetId", () => {
    test("returns false when no posts exist", () => {
      expect(fetchedPostsRepo.existsByTweetId("u1", "tweet-001")).toBe(false);
    });

    test("returns true after inserting", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "tweet-001"));
      expect(fetchedPostsRepo.existsByTweetId("u1", "tweet-001")).toBe(true);
    });

    test("scoped to user", () => {
      seedUser("u2");
      const m1 = seedMember("u1", "user1");
      fetchedPostsRepo.insertIfNew(makePostData("u1", m1.id, "tweet-001", "user1"));

      expect(fetchedPostsRepo.existsByTweetId("u1", "tweet-001")).toBe(true);
      expect(fetchedPostsRepo.existsByTweetId("u2", "tweet-001")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserId
  // ---------------------------------------------------------------------------

  describe("findByUserId", () => {
    test("returns empty array when no posts", () => {
      expect(fetchedPostsRepo.findByUserId("u1")).toEqual([]);
    });

    test("returns posts ordered by fetchedAt desc", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"));
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t2"));
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t3"));

      const posts = fetchedPostsRepo.findByUserId("u1");
      expect(posts).toHaveLength(3);
    });

    test("respects limit parameter", () => {
      const member = seedMember("u1");
      for (let i = 0; i < 5; i++) {
        fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, `t${i}`));
      }

      const posts = fetchedPostsRepo.findByUserId("u1", 2);
      expect(posts).toHaveLength(2);
    });

    test("scoped to user", () => {
      seedUser("u2");
      const m1 = seedMember("u1", "user1");
      const m2 = seedMember("u2", "user2");
      fetchedPostsRepo.insertIfNew(makePostData("u1", m1.id, "t1", "user1"));
      fetchedPostsRepo.insertIfNew(makePostData("u2", m2.id, "t2", "user2"));

      expect(fetchedPostsRepo.findByUserId("u1")).toHaveLength(1);
      expect(fetchedPostsRepo.findByUserId("u2")).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // findByMemberId
  // ---------------------------------------------------------------------------

  describe("findByMemberId", () => {
    test("returns posts for specific member", () => {
      const m1 = seedMember("u1", "user1");
      const m2 = seedMember("u1", "user2");

      fetchedPostsRepo.insertIfNew(makePostData("u1", m1.id, "t1", "user1"));
      fetchedPostsRepo.insertIfNew(makePostData("u1", m2.id, "t2", "user2"));

      const posts = fetchedPostsRepo.findByMemberId(m1.id);
      expect(posts).toHaveLength(1);
      expect(posts[0]!.twitterUsername).toBe("user1");
    });

    test("returns empty for non-existent member", () => {
      expect(fetchedPostsRepo.findByMemberId(999)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findUntranslated
  // ---------------------------------------------------------------------------

  describe("findUntranslated", () => {
    test("returns posts with null translatedText", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"));
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t2"));

      const untranslated = fetchedPostsRepo.findUntranslated("u1");
      expect(untranslated).toHaveLength(2);
    });

    test("excludes translated posts", () => {
      const member = seedMember("u1");
      const post = fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"))!;
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t2"));

      // Translate one
      fetchedPostsRepo.updateTranslation(post.id, "翻译后的文本");

      const untranslated = fetchedPostsRepo.findUntranslated("u1");
      expect(untranslated).toHaveLength(1);
      expect(untranslated[0]!.tweetId).toBe("t2");
    });

    test("respects limit", () => {
      const member = seedMember("u1");
      for (let i = 0; i < 5; i++) {
        fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, `t${i}`));
      }

      const untranslated = fetchedPostsRepo.findUntranslated("u1", 2);
      expect(untranslated).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // updateTranslation
  // ---------------------------------------------------------------------------

  describe("updateTranslation", () => {
    test("updates translatedText and translatedAt", () => {
      const member = seedMember("u1");
      const post = fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"))!;

      const updated = fetchedPostsRepo.updateTranslation(post.id, "这是翻译");
      expect(updated).toBeDefined();
      expect(updated!.translatedText).toBe("这是翻译");
      expect(updated!.translatedAt).toBeInstanceOf(Date);
    });

    test("returns undefined for non-existent post", () => {
      const updated = fetchedPostsRepo.updateTranslation(999, "text");
      expect(updated).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteByUserId
  // ---------------------------------------------------------------------------

  describe("deleteByUserId", () => {
    test("deletes all posts for a user", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"));
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t2"));

      const deleted = fetchedPostsRepo.deleteByUserId("u1");
      expect(deleted).toBe(2);
      expect(fetchedPostsRepo.findByUserId("u1")).toEqual([]);
    });

    test("returns 0 when no posts to delete", () => {
      expect(fetchedPostsRepo.deleteByUserId("u1")).toBe(0);
    });

    test("does not affect other users", () => {
      seedUser("u2");
      const m1 = seedMember("u1", "user1");
      const m2 = seedMember("u2", "user2");
      fetchedPostsRepo.insertIfNew(makePostData("u1", m1.id, "t1", "user1"));
      fetchedPostsRepo.insertIfNew(makePostData("u2", m2.id, "t2", "user2"));

      fetchedPostsRepo.deleteByUserId("u1");
      expect(fetchedPostsRepo.findByUserId("u2")).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // countByUserId & countUntranslated
  // ---------------------------------------------------------------------------

  describe("countByUserId", () => {
    test("returns 0 when no posts", () => {
      expect(fetchedPostsRepo.countByUserId("u1")).toBe(0);
    });

    test("returns correct count", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"));
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t2"));
      expect(fetchedPostsRepo.countByUserId("u1")).toBe(2);
    });
  });

  describe("countUntranslated", () => {
    test("returns 0 when no posts", () => {
      expect(fetchedPostsRepo.countUntranslated("u1")).toBe(0);
    });

    test("returns correct count excluding translated", () => {
      const member = seedMember("u1");
      const p1 = fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t1"))!;
      fetchedPostsRepo.insertIfNew(makePostData("u1", member.id, "t2"));

      fetchedPostsRepo.updateTranslation(p1.id, "翻译");

      expect(fetchedPostsRepo.countUntranslated("u1")).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // purgeOlderThan
  // ---------------------------------------------------------------------------

  describe("purgeOlderThan", () => {
    test("deletes posts with tweetCreatedAt before cutoff", () => {
      const member = seedMember("u1");

      // Insert posts with different created_at dates
      fetchedPostsRepo.insertIfNew({
        ...makePostData("u1", member.id, "old-tweet"),
        tweetCreatedAt: "2026-01-01T00:00:00.000Z",
      });
      fetchedPostsRepo.insertIfNew({
        ...makePostData("u1", member.id, "recent-tweet"),
        tweetCreatedAt: "2026-02-27T00:00:00.000Z",
      });

      expect(fetchedPostsRepo.countByUserId("u1")).toBe(2);

      // Purge posts older than Feb 1
      const purged = fetchedPostsRepo.purgeOlderThan("u1", "2026-02-01T00:00:00.000Z");
      expect(purged).toBe(1);
      expect(fetchedPostsRepo.countByUserId("u1")).toBe(1);

      // The remaining post should be the recent one
      const remaining = fetchedPostsRepo.findByUserId("u1");
      expect(remaining[0]!.tweetId).toBe("recent-tweet");
    });

    test("returns 0 when no posts match cutoff", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew({
        ...makePostData("u1", member.id, "recent"),
        tweetCreatedAt: "2026-02-27T00:00:00.000Z",
      });

      const purged = fetchedPostsRepo.purgeOlderThan("u1", "2026-01-01T00:00:00.000Z");
      expect(purged).toBe(0);
      expect(fetchedPostsRepo.countByUserId("u1")).toBe(1);
    });

    test("returns 0 when no posts exist", () => {
      const purged = fetchedPostsRepo.purgeOlderThan("u1", "2026-02-28T00:00:00.000Z");
      expect(purged).toBe(0);
    });

    test("is scoped to user", () => {
      seedUser("u2");
      const m1 = seedMember("u1", "user1");
      const m2 = seedMember("u2", "user2");

      fetchedPostsRepo.insertIfNew({
        ...makePostData("u1", m1.id, "old1", "user1"),
        tweetCreatedAt: "2026-01-01T00:00:00.000Z",
      });
      fetchedPostsRepo.insertIfNew({
        ...makePostData("u2", m2.id, "old2", "user2"),
        tweetCreatedAt: "2026-01-01T00:00:00.000Z",
      });

      // Purge only u1's posts
      const purged = fetchedPostsRepo.purgeOlderThan("u1", "2026-02-01T00:00:00.000Z");
      expect(purged).toBe(1);
      expect(fetchedPostsRepo.countByUserId("u1")).toBe(0);
      expect(fetchedPostsRepo.countByUserId("u2")).toBe(1);
    });

    test("purges all posts when cutoff is in the future", () => {
      const member = seedMember("u1");
      fetchedPostsRepo.insertIfNew({
        ...makePostData("u1", member.id, "t1"),
        tweetCreatedAt: "2026-02-27T00:00:00.000Z",
      });
      fetchedPostsRepo.insertIfNew({
        ...makePostData("u1", member.id, "t2"),
        tweetCreatedAt: "2026-02-28T00:00:00.000Z",
      });

      const purged = fetchedPostsRepo.purgeOlderThan("u1", "2026-12-31T00:00:00.000Z");
      expect(purged).toBe(2);
      expect(fetchedPostsRepo.countByUserId("u1")).toBe(0);
    });
  });
});
