import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { ScopedDB } from "@/db/scoped";
import { getDb, seedUser } from "@/db";

// E2E test bypass — when set, skip session auth and use a deterministic user
const E2E_SKIP_AUTH = process.env.E2E_SKIP_AUTH === "true";
const E2E_USER_ID = "e2e-test-user";

/**
 * Require authentication for an API route.
 * Returns a user-scoped database handle on success, or a 401 JSON response.
 *
 * With the NextAuth adapter in place, user identity is resolved via the
 * `account` table (provider + providerAccountId), so the session's user.id
 * is already the stable database ID. No ensureUserExists() needed for normal
 * auth flow. However, E2E_SKIP_AUTH bypasses OAuth entirely, so the user row
 * must be seeded explicitly to satisfy FK constraints.
 */
export async function requireAuth(): Promise<
  | { db: ScopedDB; error?: never }
  | { db?: never; error: NextResponse }
> {
  if (E2E_SKIP_AUTH) {
    // Ensure the database is initialized before seeding — seedUser() uses the
    // raw sqlite driver which is only available after getDb() has been called.
    getDb();
    // Seed the E2E user row on first call — idempotent (INSERT OR IGNORE).
    // Without this, all write operations fail with SQLITE_CONSTRAINT_FOREIGNKEY
    // because business tables have FK constraints to user(id).
    seedUser(E2E_USER_ID, "E2E Test User", "e2e@test.com");
    return { db: new ScopedDB(E2E_USER_ID) };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  return { db: new ScopedDB(session.user.id) };
}

/**
 * Require authentication AND validate a watchlist ID from route params.
 * Returns a user-scoped DB and validated watchlistId, or a JSON error response.
 */
export async function requireAuthWithWatchlist(
  params: Promise<{ id: string }> | { id: string },
): Promise<
  | { db: ScopedDB; watchlistId: number; error?: never }
  | { db?: never; watchlistId?: never; error: NextResponse }
> {
  const { db, error } = await requireAuth();
  if (error) return { error };

  const resolved = await params;
  const watchlistId = parseInt(resolved.id, 10);
  if (isNaN(watchlistId)) {
    return {
      error: NextResponse.json(
        { error: "Invalid watchlist ID" },
        { status: 400 },
      ),
    };
  }

  const watchlist = db.watchlists.findById(watchlistId);
  if (!watchlist) {
    return {
      error: NextResponse.json(
        { error: "Watchlist not found" },
        { status: 404 },
      ),
    };
  }

  return { db, watchlistId };
}

/**
 * Require authentication AND validate a group ID from route params.
 * Returns a user-scoped DB and validated groupId, or a JSON error response.
 */
export async function requireAuthWithGroup(
  params: Promise<{ id: string }> | { id: string },
): Promise<
  | { db: ScopedDB; groupId: number; error?: never }
  | { db?: never; groupId?: never; error: NextResponse }
> {
  const { db, error } = await requireAuth();
  if (error) return { error };

  const resolved = await params;
  const groupId = parseInt(resolved.id, 10);
  if (isNaN(groupId)) {
    return {
      error: NextResponse.json(
        { error: "Invalid group ID" },
        { status: 400 },
      ),
    };
  }

  const group = db.groups.findById(groupId);
  if (!group) {
    return {
      error: NextResponse.json(
        { error: "Group not found" },
        { status: 404 },
      ),
    };
  }

  return { db, groupId };
}
