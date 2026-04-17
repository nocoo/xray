import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  watchlistAdd,
  watchlistRemove,
  watchlistGet,
  watchlistExists,
  watchlistGetAll,
  watchlistToJSON,
  watchlistCount,
} from "../scripts/lib/watchlist-db";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";

describe("watchlist-db: watchlistToJSON and watchlistCount", () => {
  beforeEach(() => {
    useTestDB();
    resetDB();
  });

  afterEach(() => {
    resetDB();
    useRealDB();
  });

  test("watchlistCount returns 0 when empty", () => {
    expect(watchlistCount()).toBe(0);
  });

  test("watchlistCount reflects number of rows", () => {
    watchlistAdd({ username: "alice", url: "https://x.com/alice", added_at: "2026-01-01T00:00:00Z" });
    watchlistAdd({ username: "bob", url: "https://x.com/bob", added_at: "2026-01-02T00:00:00Z" });
    expect(watchlistCount()).toBe(2);

    watchlistRemove("alice");
    expect(watchlistCount()).toBe(1);
  });

  test("watchlistToJSON returns a Watchlist with all users", () => {
    watchlistAdd({ username: "alice", url: "https://x.com/alice", added_at: "2026-01-01T00:00:00Z" });
    watchlistAdd({ username: "bob", url: "https://x.com/bob", added_at: "2026-01-02T00:00:00Z" });

    const json = watchlistToJSON();
    expect(json.users).toHaveLength(2);
    // Sorted DESC by added_at
    expect(json.users[0]!.username).toBe("bob");
    expect(json.users[1]!.username).toBe("alice");
  });

  test("watchlistToJSON returns empty list when empty", () => {
    expect(watchlistToJSON()).toEqual({ users: [] });
  });

  test("watchlistGet and watchlistExists are case-insensitive", () => {
    watchlistAdd({ username: "Carol", url: "https://x.com/Carol", added_at: "2026-01-03T00:00:00Z" });
    expect(watchlistExists("CAROL")).toBe(true);
    expect(watchlistGet("CAROL")?.username).toBe("Carol");
    expect(watchlistGetAll()).toHaveLength(1);
  });
});
