import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb } from "@/db";
import { ProfilesRepo } from "@/db/scoped";
import type { UserInfo } from "../../../shared/types";

// =============================================================================
// ProfilesRepo Tests
// =============================================================================

const makeUserInfo = (overrides: Partial<UserInfo> = {}): UserInfo => ({
  id: "12345",
  username: "testuser",
  name: "Test User",
  description: "A test user",
  location: "San Francisco",
  profile_image_url: "https://pbs.twimg.com/test_normal.jpg",
  profile_banner_url: "https://pbs.twimg.com/banner.jpg",
  followers_count: 1000,
  following_count: 500,
  tweet_count: 2000,
  like_count: 3000,
  is_verified: true,
  created_at: "2009-06-02T20:12:29.000Z",
  pinned_tweet_id: "123456789",
  ...overrides,
});

describe("repositories/profiles", () => {
  let profiles: ProfilesRepo;

  beforeEach(() => {
    createTestDb();
    profiles = new ProfilesRepo();
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe("upsert", () => {
    test("inserts a new profile", () => {
      const info = makeUserInfo();
      const row = profiles.upsert(info);

      expect(row.twitterId).toBe("12345");
      expect(row.username).toBe("testuser");
      expect(row.displayName).toBe("Test User");
      expect(row.description).toBe("A test user");
      expect(row.location).toBe("San Francisco");
      expect(row.profileImageUrl).toBe("https://pbs.twimg.com/test_normal.jpg");
      expect(row.profileBannerUrl).toBe("https://pbs.twimg.com/banner.jpg");
      expect(row.followersCount).toBe(1000);
      expect(row.followingCount).toBe(500);
      expect(row.tweetCount).toBe(2000);
      expect(row.likeCount).toBe(3000);
      expect(row.isVerified).toBe(1);
      expect(row.accountCreatedAt).toBe("2009-06-02T20:12:29.000Z");
      expect(row.pinnedTweetId).toBe("123456789");
      expect(row.snapshotAt).toBeGreaterThan(0);
      expect(row.updatedAt).toBeGreaterThan(0);
    });

    test("updates an existing profile on conflict (same twitter_id)", () => {
      profiles.upsert(makeUserInfo({ name: "Original Name" }));

      const updated = profiles.upsert(
        makeUserInfo({ name: "Updated Name", followers_count: 9999 }),
      );

      expect(updated.displayName).toBe("Updated Name");
      expect(updated.followersCount).toBe(9999);

      // Should still be a single row
      const all = profiles.findAll();
      expect(all).toHaveLength(1);
    });

    test("normalizes username to lowercase", () => {
      const row = profiles.upsert(makeUserInfo({ username: "TestUser" }));
      expect(row.username).toBe("testuser");
    });

    test("handles optional fields being undefined", () => {
      const info = makeUserInfo({
        description: undefined,
        location: undefined,
        profile_banner_url: undefined,
        pinned_tweet_id: undefined,
      });
      const row = profiles.upsert(info);

      expect(row.description).toBeNull();
      expect(row.location).toBeNull();
      expect(row.profileBannerUrl).toBeNull();
      expect(row.pinnedTweetId).toBeNull();
    });

    test("stores is_verified as integer (0 or 1)", () => {
      const verified = profiles.upsert(makeUserInfo({ id: "1", is_verified: true }));
      expect(verified.isVerified).toBe(1);

      const unverified = profiles.upsert(makeUserInfo({ id: "2", username: "other", is_verified: false }));
      expect(unverified.isVerified).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // batchUpsert
  // ---------------------------------------------------------------------------

  describe("batchUpsert", () => {
    test("inserts multiple profiles in a transaction", () => {
      const infos = [
        makeUserInfo({ id: "1", username: "alice" }),
        makeUserInfo({ id: "2", username: "bob" }),
        makeUserInfo({ id: "3", username: "charlie" }),
      ];
      const results = profiles.batchUpsert(infos);

      expect(results).toHaveLength(3);
      expect(profiles.findAll()).toHaveLength(3);
    });

    test("returns empty array for empty input", () => {
      const results = profiles.batchUpsert([]);
      expect(results).toHaveLength(0);
    });

    test("updates existing profiles in batch", () => {
      profiles.upsert(makeUserInfo({ id: "1", username: "alice", name: "Old Alice" }));

      const results = profiles.batchUpsert([
        makeUserInfo({ id: "1", username: "alice", name: "New Alice" }),
        makeUserInfo({ id: "2", username: "bob" }),
      ]);

      expect(results).toHaveLength(2);
      expect(profiles.findByTwitterId("1")?.displayName).toBe("New Alice");
      expect(profiles.findAll()).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // findByTwitterId
  // ---------------------------------------------------------------------------

  describe("findByTwitterId", () => {
    test("returns the profile for a valid twitter_id", () => {
      profiles.upsert(makeUserInfo());
      const found = profiles.findByTwitterId("12345");
      expect(found).toBeDefined();
      expect(found!.username).toBe("testuser");
    });

    test("returns undefined for a non-existent twitter_id", () => {
      expect(profiles.findByTwitterId("99999")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // findByUsername
  // ---------------------------------------------------------------------------

  describe("findByUsername", () => {
    test("finds profile by username (case-insensitive)", () => {
      profiles.upsert(makeUserInfo({ username: "ElonMusk" }));
      const found = profiles.findByUsername("elonmusk");
      expect(found).toBeDefined();
      expect(found!.twitterId).toBe("12345");
    });

    test("returns undefined for non-existent username", () => {
      expect(profiles.findByUsername("nobody")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // findByIds
  // ---------------------------------------------------------------------------

  describe("findByIds", () => {
    test("finds multiple profiles by IDs", () => {
      profiles.batchUpsert([
        makeUserInfo({ id: "1", username: "alice" }),
        makeUserInfo({ id: "2", username: "bob" }),
        makeUserInfo({ id: "3", username: "charlie" }),
      ]);

      const found = profiles.findByIds(["1", "3"]);
      expect(found).toHaveLength(2);
      expect(found.map((p) => p.username).sort()).toEqual(["alice", "charlie"]);
    });

    test("returns empty array for empty input", () => {
      expect(profiles.findByIds([])).toHaveLength(0);
    });

    test("ignores non-existent IDs", () => {
      profiles.upsert(makeUserInfo({ id: "1", username: "alice" }));
      const found = profiles.findByIds(["1", "999"]);
      expect(found).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // findByUsernames
  // ---------------------------------------------------------------------------

  describe("findByUsernames", () => {
    test("finds multiple profiles by usernames", () => {
      profiles.batchUpsert([
        makeUserInfo({ id: "1", username: "alice" }),
        makeUserInfo({ id: "2", username: "bob" }),
      ]);

      const found = profiles.findByUsernames(["Alice", "Bob"]);
      expect(found).toHaveLength(2);
    });

    test("returns empty array for empty input", () => {
      expect(profiles.findByUsernames([])).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // toInfo / toInfos
  // ---------------------------------------------------------------------------

  describe("toInfo / toInfos", () => {
    test("converts a DB row back to UserInfo", () => {
      const original = makeUserInfo();
      const row = profiles.upsert(original);
      const info = profiles.toInfo(row);

      expect(info.id).toBe(original.id);
      expect(info.username).toBe(original.username.toLowerCase());
      expect(info.name).toBe(original.name);
      expect(info.description).toBe(original.description);
      expect(info.location).toBe(original.location);
      expect(info.profile_image_url).toBe(original.profile_image_url);
      expect(info.profile_banner_url).toBe(original.profile_banner_url);
      expect(info.followers_count).toBe(original.followers_count);
      expect(info.following_count).toBe(original.following_count);
      expect(info.tweet_count).toBe(original.tweet_count);
      expect(info.like_count).toBe(original.like_count);
      expect(info.is_verified).toBe(original.is_verified);
      expect(info.created_at).toBe(original.created_at);
      expect(info.pinned_tweet_id).toBe(original.pinned_tweet_id);
    });

    test("converts multiple rows", () => {
      const rows = profiles.batchUpsert([
        makeUserInfo({ id: "1", username: "alice" }),
        makeUserInfo({ id: "2", username: "bob" }),
      ]);
      const infos = profiles.toInfos(rows);
      expect(infos).toHaveLength(2);
      expect(infos[0]!.username).toBe("alice");
      expect(infos[1]!.username).toBe("bob");
    });

    test("handles null optional fields gracefully", () => {
      const row = profiles.upsert(
        makeUserInfo({
          description: undefined,
          location: undefined,
          profile_banner_url: undefined,
          pinned_tweet_id: undefined,
        }),
      );
      const info = profiles.toInfo(row);
      expect(info.description).toBeUndefined();
      expect(info.location).toBeUndefined();
      expect(info.profile_banner_url).toBeUndefined();
      expect(info.pinned_tweet_id).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  describe("findAll", () => {
    test("returns all profiles", () => {
      profiles.batchUpsert([
        makeUserInfo({ id: "1", username: "alice" }),
        makeUserInfo({ id: "2", username: "bob" }),
      ]);
      expect(profiles.findAll()).toHaveLength(2);
    });

    test("returns empty array when no profiles exist", () => {
      expect(profiles.findAll()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Username change scenario
  // ---------------------------------------------------------------------------

  describe("username changes", () => {
    test("updates username when twitter_id stays the same", () => {
      profiles.upsert(makeUserInfo({ id: "44196397", username: "elonmusk" }));
      profiles.upsert(makeUserInfo({ id: "44196397", username: "kekius_maximus" }));

      const all = profiles.findAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.username).toBe("kekius_maximus");

      // Old username should no longer be findable
      expect(profiles.findByUsername("elonmusk")).toBeUndefined();
      // New username should work
      expect(profiles.findByUsername("kekius_maximus")).toBeDefined();
    });
  });
});
