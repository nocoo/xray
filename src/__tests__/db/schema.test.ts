import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDb, closeDb, db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  apiCredentials,
  webhooks,
  usageStats,
} from "@/db/schema";

// =============================================================================
// Schema CRUD Operations
// =============================================================================

describe("db/schema", () => {
  beforeEach(() => {
    createTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // Users table
  // ---------------------------------------------------------------------------

  describe("users", () => {
    test("insert and select a user", () => {
      db.insert(users)
        .values({ id: "u1", name: "Alice", email: "alice@example.com" })
        .run();

      const result = db.select().from(users).where(eq(users.id, "u1")).all();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Alice");
      expect(result[0].email).toBe("alice@example.com");
    });

    test("email uniqueness constraint", () => {
      db.insert(users)
        .values({ id: "u1", name: "Alice", email: "alice@example.com" })
        .run();

      expect(() => {
        db.insert(users)
          .values({ id: "u2", name: "Bob", email: "alice@example.com" })
          .run();
      }).toThrow();
    });

    test("auto-generates id via $defaultFn", () => {
      db.insert(users)
        .values({ name: "NoID", email: "noid@example.com" })
        .run();

      const result = db
        .select()
        .from(users)
        .where(eq(users.email, "noid@example.com"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(result[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    test("nullable fields default to null", () => {
      db.insert(users).values({ id: "u1", email: "min@example.com" }).run();

      const result = db.select().from(users).where(eq(users.id, "u1")).all();
      expect(result[0].name).toBeNull();
      expect(result[0].image).toBeNull();
      expect(result[0].emailVerified).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Accounts table
  // ---------------------------------------------------------------------------

  describe("accounts", () => {
    test("insert account with user FK", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(accounts)
        .values({
          userId: "u1",
          type: "oauth",
          provider: "google",
          providerAccountId: "goog-123",
        })
        .run();

      const result = db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, "u1"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("google");
    });

    test("composite primary key (provider, providerAccountId)", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(accounts)
        .values({
          userId: "u1",
          type: "oauth",
          provider: "google",
          providerAccountId: "goog-123",
        })
        .run();

      // Duplicate composite key should throw
      expect(() => {
        db.insert(accounts)
          .values({
            userId: "u1",
            type: "oauth",
            provider: "google",
            providerAccountId: "goog-123",
          })
          .run();
      }).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Sessions table
  // ---------------------------------------------------------------------------

  describe("sessions", () => {
    test("insert and select session", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();

      const expires = new Date("2026-12-31T00:00:00Z");
      db.insert(sessions)
        .values({ sessionToken: "tok-abc", userId: "u1", expires })
        .run();

      const result = db
        .select()
        .from(sessions)
        .where(eq(sessions.sessionToken, "tok-abc"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe("u1");
    });
  });

  // ---------------------------------------------------------------------------
  // Verification Tokens table
  // ---------------------------------------------------------------------------

  describe("verificationTokens", () => {
    test("insert with composite primary key", () => {
      const expires = new Date("2026-12-31T00:00:00Z");
      db.insert(verificationTokens)
        .values({ identifier: "email@example.com", token: "vt-123", expires })
        .run();

      const result = db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.identifier, "email@example.com"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].token).toBe("vt-123");
    });
  });

  // ---------------------------------------------------------------------------
  // API Credentials table
  // ---------------------------------------------------------------------------

  describe("apiCredentials", () => {
    test("insert and select credentials", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(apiCredentials)
        .values({
          userId: "u1",
          tweapiKey: "key-123",
          twitterCookie: "cookie-abc",
        })
        .run();

      const result = db
        .select()
        .from(apiCredentials)
        .where(eq(apiCredentials.userId, "u1"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].tweapiKey).toBe("key-123");
      expect(result[0].twitterCookie).toBe("cookie-abc");
    });

    test("auto-increment id", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(apiCredentials).values({ userId: "u1" }).run();
      db.insert(apiCredentials).values({ userId: "u1" }).run();

      const result = db
        .select()
        .from(apiCredentials)
        .where(eq(apiCredentials.userId, "u1"))
        .all();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    test("sets createdAt and updatedAt via $defaultFn", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(apiCredentials).values({ userId: "u1" }).run();

      const result = db
        .select()
        .from(apiCredentials)
        .where(eq(apiCredentials.userId, "u1"))
        .all();
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].updatedAt).toBeInstanceOf(Date);
    });

    test("nullable credential fields", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(apiCredentials).values({ userId: "u1" }).run();

      const result = db
        .select()
        .from(apiCredentials)
        .where(eq(apiCredentials.userId, "u1"))
        .all();
      expect(result[0].tweapiKey).toBeNull();
      expect(result[0].twitterCookie).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Webhooks table
  // ---------------------------------------------------------------------------

  describe("webhooks", () => {
    test("insert and select webhook", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(webhooks)
        .values({
          userId: "u1",
          keyHash: "sha256-hash-value",
          keyPrefix: "xk_a",
        })
        .run();

      const result = db
        .select()
        .from(webhooks)
        .where(eq(webhooks.userId, "u1"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].keyHash).toBe("sha256-hash-value");
      expect(result[0].keyPrefix).toBe("xk_a");
    });

    test("keyHash and keyPrefix are required (NOT NULL)", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();

      // Missing required fields should throw
      expect(() => {
        db.insert(webhooks).values({ userId: "u1" } as never).run();
      }).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Usage Stats table
  // ---------------------------------------------------------------------------

  describe("usageStats", () => {
    test("insert and select usage stat", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(usageStats)
        .values({
          userId: "u1",
          endpoint: "/api/tweets",
          requestCount: 42,
          date: "2026-02-24",
        })
        .run();

      const result = db
        .select()
        .from(usageStats)
        .where(eq(usageStats.userId, "u1"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].endpoint).toBe("/api/tweets");
      expect(result[0].requestCount).toBe(42);
      expect(result[0].date).toBe("2026-02-24");
    });

    test("requestCount defaults to 0", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(usageStats)
        .values({ userId: "u1", endpoint: "/api/test", date: "2026-01-01" })
        .run();

      const result = db
        .select()
        .from(usageStats)
        .where(eq(usageStats.userId, "u1"))
        .all();
      expect(result[0].requestCount).toBe(0);
    });

    test("lastUsedAt is nullable", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(usageStats)
        .values({ userId: "u1", endpoint: "/api/test", date: "2026-01-01" })
        .run();

      const result = db
        .select()
        .from(usageStats)
        .where(eq(usageStats.userId, "u1"))
        .all();
      expect(result[0].lastUsedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Foreign key cascade delete
  // ---------------------------------------------------------------------------

  describe("cascade delete", () => {
    test("deleting a user cascades to related tables", () => {
      db.insert(users)
        .values({ id: "u1", email: "user@example.com" })
        .run();
      db.insert(apiCredentials)
        .values({ userId: "u1", tweapiKey: "key" })
        .run();
      db.insert(webhooks)
        .values({
          userId: "u1",
          keyHash: "hash",
          keyPrefix: "xk_a",
        })
        .run();
      db.insert(usageStats)
        .values({ userId: "u1", endpoint: "/api/test", date: "2026-01-01" })
        .run();
      db.insert(accounts)
        .values({
          userId: "u1",
          type: "oauth",
          provider: "google",
          providerAccountId: "g1",
        })
        .run();

      // Enable foreign keys (SQLite requires explicit enabling)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getRawSqlite } = require("@/db");
      const sqlite = getRawSqlite();
      sqlite.exec("PRAGMA foreign_keys = ON");

      // Delete the user
      db.delete(users).where(eq(users.id, "u1")).run();

      // All related records should be gone
      expect(
        db.select().from(apiCredentials).where(eq(apiCredentials.userId, "u1")).all()
      ).toHaveLength(0);
      expect(
        db.select().from(webhooks).where(eq(webhooks.userId, "u1")).all()
      ).toHaveLength(0);
      expect(
        db.select().from(usageStats).where(eq(usageStats.userId, "u1")).all()
      ).toHaveLength(0);
      expect(
        db.select().from(accounts).where(eq(accounts.userId, "u1")).all()
      ).toHaveLength(0);
    });
  });
});
