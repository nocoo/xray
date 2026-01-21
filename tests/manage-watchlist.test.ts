import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "path";
import type { Watchlist } from "../scripts/lib/types";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";

describe("manage-watchlist", () => {
  beforeAll(() => {
    useTestDB();
    resetDB();
  });

  afterAll(() => {
    resetDB();
    useRealDB();
  });

  beforeEach(async () => {
    resetDB();
  });

  describe("addUser", () => {
    test("adds user by username", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      const result = await addUser("karpathy");

      expect(result.success).toBe(true);
      expect(result.data?.username).toBe("karpathy");
      expect(result.data?.url).toBe("https://x.com/karpathy");
    });

    test("adds user by URL", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      const result = await addUser("https://x.com/elonmusk");

      expect(result.success).toBe(true);
      expect(result.data?.username).toBe("elonmusk");
    });

    test("adds user with @ prefix", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      const result = await addUser("@ThePeterMick");

      expect(result.success).toBe(true);
      expect(result.data?.username).toBe("ThePeterMick");
    });

    test("rejects duplicate user", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      await addUser("karpathy");
      const result = await addUser("karpathy");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DUPLICATE");
    });

    test("rejects invalid username", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      const result = await addUser("invalid-user-name!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_USERNAME");
    });

    test("rejects invalid x.com URL (no username found)", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      const result = await addUser("https://x.com/");

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_URL");
    });

    test("treats non-twitter URL as username (and rejects if invalid)", async () => {
      const { addUser } = await import("../scripts/manage-watchlist");
      // google.com URL is not recognized as Twitter, so treated as username
      const result = await addUser("https://google.com/notauser");

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_USERNAME");
    });
  });

  describe("removeUser", () => {
    test("removes existing user", async () => {
      const { addUser, removeUser } = await import("../scripts/manage-watchlist");
      await addUser("karpathy");
      const result = await removeUser("karpathy");

      expect(result.success).toBe(true);
      expect(result.data?.username).toBe("karpathy");
    });

    test("handles non-existent user", async () => {
      const { removeUser } = await import("../scripts/manage-watchlist");
      const result = await removeUser("nonexistent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("NOT_FOUND");
    });

    test("is case-insensitive", async () => {
      const { addUser, removeUser } = await import("../scripts/manage-watchlist");
      await addUser("Karpathy");
      const result = await removeUser("karpathy");

      expect(result.success).toBe(true);
    });
  });

  describe("listUsers", () => {
    test("returns empty list", async () => {
      const { listUsers } = await import("../scripts/manage-watchlist");
      const result = await listUsers();

      expect(result.success).toBe(true);
      expect(result.data?.users).toHaveLength(0);
    });

    test("returns all users", async () => {
      const { addUser, listUsers } = await import("../scripts/manage-watchlist");
      await addUser("karpathy");
      await addUser("elonmusk");
      const result = await listUsers();

      expect(result.success).toBe(true);
      expect(result.data?.users).toHaveLength(2);
    });
  });

  describe("hasUser", () => {
    test("returns true for existing user", async () => {
      const { addUser, hasUser } = await import("../scripts/manage-watchlist");
      await addUser("karpathy");
      const result = await hasUser("karpathy");

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    test("returns false for non-existent user", async () => {
      const { hasUser } = await import("../scripts/manage-watchlist");
      const result = await hasUser("nonexistent");

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });
});
