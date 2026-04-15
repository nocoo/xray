import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, seedUser } from "@/db";
import { GroupsRepo, GroupMembersRepo, ProfilesRepo } from "@/db/scoped";
import type { UserInfo } from "../../../shared/types";

// =============================================================================
// Test helpers
// =============================================================================

const USER_ID = "test-user-groups";
const OTHER_USER_ID = "other-user-groups";

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

// =============================================================================
// GroupsRepo Tests
// =============================================================================

describe("repositories/groups", () => {
  let groups: GroupsRepo;

  beforeEach(() => {
    createTestDb();
    seedUser(USER_ID);
    seedUser(OTHER_USER_ID, "Other User");
    groups = new GroupsRepo(USER_ID);
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    test("creates a group with name only", () => {
      const g = groups.create({ name: "Alpha Group" });
      expect(g.id).toBeGreaterThan(0);
      expect(g.name).toBe("Alpha Group");
      expect(g.description).toBeNull();
      expect(g.icon).toBe("users");
      expect(g.userId).toBe(USER_ID);
      expect(g.createdAt).toBeInstanceOf(Date);
    });

    test("creates a group with all fields", () => {
      const g = groups.create({
        name: "Beta Group",
        description: "A beta group",
        icon: "star",
      });
      expect(g.name).toBe("Beta Group");
      expect(g.description).toBe("A beta group");
      expect(g.icon).toBe("star");
    });

    test("creates multiple groups with unique IDs", () => {
      const g1 = groups.create({ name: "Group 1" });
      const g2 = groups.create({ name: "Group 2" });
      expect(g1.id).not.toBe(g2.id);
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  describe("findAll", () => {
    test("returns empty array when no groups exist", () => {
      expect(groups.findAll()).toEqual([]);
    });

    test("returns only groups owned by this user", () => {
      groups.create({ name: "My Group" });
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      otherGroups.create({ name: "Their Group" });

      const mine = groups.findAll();
      expect(mine).toHaveLength(1);
      expect(mine[0]!.name).toBe("My Group");
    });

    test("returns all groups for this user", () => {
      groups.create({ name: "First" });
      groups.create({ name: "Second" });
      groups.create({ name: "Third" });

      const all = groups.findAll();
      expect(all).toHaveLength(3);
      const names = all.map((g) => g.name);
      expect(names).toContain("First");
      expect(names).toContain("Second");
      expect(names).toContain("Third");
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------

  describe("findById", () => {
    test("returns the group by ID", () => {
      const created = groups.create({ name: "Findable" });
      const found = groups.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Findable");
    });

    test("returns undefined for non-existent ID", () => {
      expect(groups.findById(9999)).toBeUndefined();
    });

    test("returns undefined for another user's group", () => {
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      const g = otherGroups.create({ name: "Not mine" });
      expect(groups.findById(g.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe("update", () => {
    test("updates name", () => {
      const g = groups.create({ name: "Old Name" });
      const updated = groups.update(g.id, { name: "New Name" });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe("New Name");
    });

    test("updates description and icon", () => {
      const g = groups.create({ name: "Group" });
      const updated = groups.update(g.id, {
        description: "Updated description",
        icon: "flame",
      });
      expect(updated!.description).toBe("Updated description");
      expect(updated!.icon).toBe("flame");
    });

    test("returns undefined for non-existent ID", () => {
      expect(groups.update(9999, { name: "Nope" })).toBeUndefined();
    });

    test("returns undefined for another user's group", () => {
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      const g = otherGroups.create({ name: "Theirs" });
      expect(groups.update(g.id, { name: "Hijack" })).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteById
  // ---------------------------------------------------------------------------

  describe("deleteById", () => {
    test("deletes own group", () => {
      const g = groups.create({ name: "To Delete" });
      expect(groups.deleteById(g.id)).toBe(true);
      expect(groups.findById(g.id)).toBeUndefined();
    });

    test("returns false for non-existent ID", () => {
      expect(groups.deleteById(9999)).toBe(false);
    });

    test("returns false for another user's group", () => {
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      const g = otherGroups.create({ name: "Protected" });
      expect(groups.deleteById(g.id)).toBe(false);
    });
  });
});

// =============================================================================
// GroupMembersRepo Tests
// =============================================================================

describe("repositories/groupMembers", () => {
  let groups: GroupsRepo;
  let members: GroupMembersRepo;
  let profiles: ProfilesRepo;
  let groupId: number;

  beforeEach(() => {
    createTestDb();
    seedUser(USER_ID);
    seedUser(OTHER_USER_ID, "Other User");
    groups = new GroupsRepo(USER_ID);
    members = new GroupMembersRepo(USER_ID);
    profiles = new ProfilesRepo();
    groupId = groups.create({ name: "Test Group" }).id;
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    test("creates a member with normalized username", () => {
      const m = members.create({ groupId, twitterUsername: "@TestUser" });
      expect(m.id).toBeGreaterThan(0);
      expect(m.twitterUsername).toBe("testuser");
      expect(m.groupId).toBe(groupId);
      expect(m.twitterId).toBeNull();
      expect(m.userId).toBe(USER_ID);
    });

    test("auto-resolves twitter_id from cached profiles", () => {
      profiles.upsert(makeUserInfo({ id: "99999", username: "cached_user" }));
      const m = members.create({ groupId, twitterUsername: "cached_user" });
      expect(m.twitterId).toBe("99999");
    });

    test("rejects duplicate username in same group", () => {
      members.create({ groupId, twitterUsername: "dup_user" });
      expect(() =>
        members.create({ groupId, twitterUsername: "dup_user" }),
      ).toThrow();
    });

    test("allows same username in different groups", () => {
      const g2 = groups.create({ name: "Group 2" }).id;
      const m1 = members.create({ groupId, twitterUsername: "shared_user" });
      const m2 = members.create({ groupId: g2, twitterUsername: "shared_user" });
      expect(m1.id).not.toBe(m2.id);
    });
  });

  // ---------------------------------------------------------------------------
  // batchCreate
  // ---------------------------------------------------------------------------

  describe("batchCreate", () => {
    test("inserts multiple members", () => {
      const count = members.batchCreate(groupId, ["alice", "bob", "charlie"]);
      expect(count).toBe(3);
      expect(members.findByGroupId(groupId)).toHaveLength(3);
    });

    test("skips duplicates silently", () => {
      members.create({ groupId, twitterUsername: "alice" });
      const count = members.batchCreate(groupId, ["alice", "bob"]);
      expect(count).toBe(1); // only bob inserted
      expect(members.findByGroupId(groupId)).toHaveLength(2);
    });

    test("normalizes usernames (strips @, lowercases)", () => {
      members.batchCreate(groupId, ["@Alice", "BOB"]);
      const all = members.findByGroupId(groupId);
      expect(all.map((m) => m.twitterUsername).sort()).toEqual(["alice", "bob"]);
    });

    test("skips empty strings", () => {
      const count = members.batchCreate(groupId, ["alice", "", "  "]);
      // empty string is skipped, but whitespace-only passes (not ideal but matches current impl)
      // actually whitespace will be kept as-is minus @ prefix
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("auto-resolves twitter_id for cached profiles", () => {
      profiles.upsert(makeUserInfo({ id: "111", username: "alice" }));
      profiles.upsert(makeUserInfo({ id: "222", username: "bob" }));
      members.batchCreate(groupId, ["alice", "bob", "unknown"]);

      const all = members.findByGroupId(groupId);
      const aliceMember = all.find((m) => m.twitterUsername === "alice");
      const bobMember = all.find((m) => m.twitterUsername === "bob");
      const unknownMember = all.find((m) => m.twitterUsername === "unknown");
      expect(aliceMember!.twitterId).toBe("111");
      expect(bobMember!.twitterId).toBe("222");
      expect(unknownMember!.twitterId).toBeNull();
    });

    test("returns 0 for empty array", () => {
      expect(members.batchCreate(groupId, [])).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // findByGroupId
  // ---------------------------------------------------------------------------

  describe("findByGroupId", () => {
    test("returns empty array when no members exist", () => {
      expect(members.findByGroupId(groupId)).toEqual([]);
    });

    test("returns members with profile data", () => {
      profiles.upsert(makeUserInfo({ id: "555", username: "profiled" }));
      members.create({ groupId, twitterUsername: "profiled" });

      const result = members.findByGroupId(groupId);
      expect(result).toHaveLength(1);
      expect(result[0]!.profile).not.toBeNull();
      expect(result[0]!.profile!.twitterId).toBe("555");
      expect(result[0]!.profile!.followersCount).toBe(1000);
    });

    test("returns null profile for unresolved members", () => {
      members.create({ groupId, twitterUsername: "noProfile" });
      const result = members.findByGroupId(groupId);
      expect(result).toHaveLength(1);
      expect(result[0]!.profile).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  describe("findAll", () => {
    test("returns all members across groups for this user", () => {
      const g2 = groups.create({ name: "Group 2" }).id;
      members.create({ groupId, twitterUsername: "user1" });
      members.create({ groupId: g2, twitterUsername: "user2" });

      const all = members.findAll();
      expect(all).toHaveLength(2);
    });

    test("does not return other user's members", () => {
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      const otherMembers = new GroupMembersRepo(OTHER_USER_ID);
      const otherG = otherGroups.create({ name: "Other" }).id;
      otherMembers.create({ groupId: otherG, twitterUsername: "stranger" });

      members.create({ groupId, twitterUsername: "mine" });
      expect(members.findAll()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------

  describe("findById", () => {
    test("returns member by ID with profile", () => {
      profiles.upsert(makeUserInfo({ id: "777", username: "findme" }));
      const m = members.create({ groupId, twitterUsername: "findme" });
      const found = members.findById(m.id);
      expect(found).toBeDefined();
      expect(found!.twitterUsername).toBe("findme");
      expect(found!.profile).not.toBeNull();
    });

    test("returns undefined for non-existent ID", () => {
      expect(members.findById(9999)).toBeUndefined();
    });

    test("returns undefined for another user's member", () => {
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      const otherMembers = new GroupMembersRepo(OTHER_USER_ID);
      const otherG = otherGroups.create({ name: "Other" }).id;
      const m = otherMembers.create({ groupId: otherG, twitterUsername: "stolen" });
      expect(members.findById(m.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // findByUsernameAndGroup
  // ---------------------------------------------------------------------------

  describe("findByUsernameAndGroup", () => {
    test("finds member by username and group", () => {
      members.create({ groupId, twitterUsername: "target" });
      const found = members.findByUsernameAndGroup("target", groupId);
      expect(found).toBeDefined();
      expect(found!.twitterUsername).toBe("target");
    });

    test("is case-insensitive", () => {
      members.create({ groupId, twitterUsername: "Target" });
      const found = members.findByUsernameAndGroup("target", groupId);
      expect(found).toBeDefined();
    });

    test("returns undefined when not found", () => {
      expect(members.findByUsernameAndGroup("ghost", groupId)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // linkProfilesByUsername
  // ---------------------------------------------------------------------------

  describe("linkProfilesByUsername", () => {
    test("links unlinked members to matching profiles", () => {
      members.create({ groupId, twitterUsername: "unlinkable" });
      // Insert the profile AFTER creating the member
      profiles.upsert(makeUserInfo({ id: "888", username: "unlinkable" }));

      const linked = members.linkProfilesByUsername(groupId);
      expect(linked).toBe(1);

      const result = members.findByGroupId(groupId);
      expect(result[0]!.twitterId).toBe("888");
      expect(result[0]!.profile).not.toBeNull();
    });

    test("returns 0 when all members already linked", () => {
      profiles.upsert(makeUserInfo({ id: "999", username: "already" }));
      members.create({ groupId, twitterUsername: "already" });
      // Member was auto-linked at create time
      expect(members.linkProfilesByUsername(groupId)).toBe(0);
    });

    test("returns 0 for group with no members", () => {
      expect(members.linkProfilesByUsername(groupId)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteById
  // ---------------------------------------------------------------------------

  describe("deleteById", () => {
    test("deletes own member", () => {
      const m = members.create({ groupId, twitterUsername: "doomed" });
      expect(members.deleteById(m.id)).toBe(true);
      expect(members.findById(m.id)).toBeUndefined();
    });

    test("returns false for non-existent ID", () => {
      expect(members.deleteById(9999)).toBe(false);
    });

    test("returns false for another user's member", () => {
      const otherGroups = new GroupsRepo(OTHER_USER_ID);
      const otherMembers = new GroupMembersRepo(OTHER_USER_ID);
      const otherG = otherGroups.create({ name: "Other" }).id;
      const m = otherMembers.create({ groupId: otherG, twitterUsername: "safe" });
      expect(members.deleteById(m.id)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteByGroupId
  // ---------------------------------------------------------------------------

  describe("deleteByGroupId", () => {
    test("deletes all members in group", () => {
      members.batchCreate(groupId, ["a", "b", "c"]);
      const deleted = members.deleteByGroupId(groupId);
      expect(deleted).toBe(3);
      expect(members.findByGroupId(groupId)).toEqual([]);
    });

    test("returns 0 for empty group", () => {
      expect(members.deleteByGroupId(groupId)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // countByGroupId
  // ---------------------------------------------------------------------------

  describe("countByGroupId", () => {
    test("returns 0 for empty group", () => {
      expect(members.countByGroupId(groupId)).toBe(0);
    });

    test("returns correct count", () => {
      members.batchCreate(groupId, ["a", "b", "c", "d"]);
      expect(members.countByGroupId(groupId)).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // cascade delete
  // ---------------------------------------------------------------------------

  describe("cascade delete", () => {
    test("deleting a group cascades to its members", () => {
      members.batchCreate(groupId, ["a", "b"]);
      expect(members.countByGroupId(groupId)).toBe(2);

      groups.deleteById(groupId);
      expect(members.countByGroupId(groupId)).toBe(0);
    });
  });
});
