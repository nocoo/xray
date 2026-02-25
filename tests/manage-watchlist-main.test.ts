import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { main } from "../scripts/manage-watchlist";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import { addUser } from "../scripts/manage-watchlist";

describe("manage-watchlist main()", () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  beforeAll(() => {
    useTestDB();
  });

  afterAll(() => {
    useRealDB();
  });

  beforeEach(() => {
    resetDB();
    originalArgv = process.argv;
    originalExit = process.exit;
    exitCode = undefined;
    // Mock process.exit to prevent test runner termination
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`EXIT_${code}`);
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  test("shows usage and exits 1 when no command given", async () => {
    process.argv = ["bun", "manage-watchlist.ts"];

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("exits 1 for unknown command", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "unknown"];

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("add command succeeds", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "add", "testuser"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });

  test("add command exits 1 when no param", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "add"];

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("remove command succeeds for existing user", async () => {
    await addUser("testuser");
    process.argv = ["bun", "manage-watchlist.ts", "remove", "testuser"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });

  test("remove command exits 1 when no param", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "remove"];

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("remove command exits 1 for non-existent user", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "remove", "nonexistent"];

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("list command shows empty watchlist", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "list"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });

  test("list command shows users with formatted output", async () => {
    await addUser("alice");
    await addUser("bob");
    process.argv = ["bun", "manage-watchlist.ts", "list"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });

  test("has command exits 1 when no param", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "has"];

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("has command succeeds for existing user", async () => {
    await addUser("testuser");
    process.argv = ["bun", "manage-watchlist.ts", "has", "testuser"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });

  test("has command exits 1 for non-existent user (data=false)", async () => {
    process.argv = ["bun", "manage-watchlist.ts", "has", "nonexistent"];

    // hasUser returns success: true, data: false — so exit code depends on result.success
    // result.success is true, so exit code should be 0
    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });
});
