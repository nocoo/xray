import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";

// =============================================================================
// Helpers
// =============================================================================

function seedUser(id = "u1") {
  db.insert(users)
    .values({ id, name: "Test User", email: `${id}@example.com` })
    .run();
}

// =============================================================================
// Tests
// =============================================================================

describe("fetch-logs repository", () => {
  beforeEach(() => {
    createTestDb();
    seedUser("u1");
  });

  afterEach(() => {
    closeDb();
  });

  // ── insert ──

  test("insert creates a log entry and returns it", () => {
    const log = fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 10,
      succeeded: 5,
      skipped: 3,
      purged: 2,
      errorCount: 2,
      errors: JSON.stringify(["@user1: timeout", "@user2: rate limit"]),
    });

    expect(log.id).toBeGreaterThan(0);
    expect(log.type).toBe("fetch");
    expect(log.attempted).toBe(10);
    expect(log.succeeded).toBe(5);
    expect(log.skipped).toBe(3);
    expect(log.purged).toBe(2);
    expect(log.errorCount).toBe(2);
    expect(log.errors).toBe(JSON.stringify(["@user1: timeout", "@user2: rate limit"]));
    expect(log.createdAt).toBeTruthy();
  });

  test("insert with null errors when no errors", () => {
    const log = fetchLogsRepo.insert({
      userId: "u1",
      type: "translate",
      attempted: 5,
      succeeded: 5,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    expect(log.errors).toBeNull();
    expect(log.errorCount).toBe(0);
  });

  // ── findByUserId ──

  test("findByUserId returns logs in newest-first order", () => {
    fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 5,
      succeeded: 3,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      type: "translate",
      attempted: 10,
      succeeded: 8,
      skipped: 0,
      purged: 0,
      errorCount: 2,
      errors: JSON.stringify(["error1", "error2"]),
    });

    const logs = fetchLogsRepo.findByUserId("u1");
    expect(logs).toHaveLength(2);
    // Newest first — translate was inserted second (higher id)
    expect(logs[0]!.id).toBeGreaterThan(logs[1]!.id);
  });

  test("findByUserId respects limit", () => {
    for (let i = 0; i < 5; i++) {
      fetchLogsRepo.insert({
        userId: "u1",
        type: "fetch",
        attempted: i,
        succeeded: i,
        skipped: 0,
        purged: 0,
        errorCount: 0,
        errors: null,
      });
    }

    const logs = fetchLogsRepo.findByUserId("u1", 3);
    expect(logs).toHaveLength(3);
  });

  test("findByUserId only returns logs for the specified user", () => {
    seedUser("u2");

    fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u2",
      type: "translate",
      attempted: 2,
      succeeded: 2,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    const u1Logs = fetchLogsRepo.findByUserId("u1");
    expect(u1Logs).toHaveLength(1);
    expect(u1Logs[0]!.type).toBe("fetch");

    const u2Logs = fetchLogsRepo.findByUserId("u2");
    expect(u2Logs).toHaveLength(1);
    expect(u2Logs[0]!.type).toBe("translate");
  });

  // ── findById ──

  test("findById returns a specific log entry", () => {
    const inserted = fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 10,
      succeeded: 7,
      skipped: 2,
      purged: 1,
      errorCount: 1,
      errors: JSON.stringify(["@foo: bar"]),
    });

    const found = fetchLogsRepo.findById(inserted.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(inserted.id);
    expect(found!.attempted).toBe(10);
  });

  test("findById returns undefined for non-existent id", () => {
    const found = fetchLogsRepo.findById(999);
    expect(found).toBeUndefined();
  });

  // ── countByUserId ──

  test("countByUserId returns correct count", () => {
    expect(fetchLogsRepo.countByUserId("u1")).toBe(0);

    fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      type: "translate",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    expect(fetchLogsRepo.countByUserId("u1")).toBe(2);
  });

  // ── deleteByUserId ──

  test("deleteByUserId removes all logs for a user", () => {
    fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      type: "translate",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    const deleted = fetchLogsRepo.deleteByUserId("u1");
    expect(deleted).toBe(2);
    expect(fetchLogsRepo.countByUserId("u1")).toBe(0);
  });

  test("deleteByUserId does not affect other users", () => {
    seedUser("u2");

    fetchLogsRepo.insert({
      userId: "u1",
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u2",
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.deleteByUserId("u1");
    expect(fetchLogsRepo.countByUserId("u1")).toBe(0);
    expect(fetchLogsRepo.countByUserId("u2")).toBe(1);
  });
});
