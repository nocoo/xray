import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// E2E test bypass — when set, skip session auth and use a deterministic user
const E2E_SKIP_AUTH = process.env.E2E_SKIP_AUTH === "true";
const E2E_USER: AuthenticatedUser = {
  id: "e2e-test-user",
  email: "e2e@test.com",
  name: "E2E Test User",
  image: null,
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

/**
 * Ensure the authenticated user exists in the database.
 * With JWT sessions, NextAuth doesn't persist users to the DB automatically.
 * This upserts the user row so FK constraints on business tables are satisfied.
 *
 * IMPORTANT: Without a NextAuth adapter, each OAuth sign-in generates a new
 * random UUID as user.id. The same Google account will get different IDs across
 * browsers, after cookie expiry, or after sign-out/sign-in. We resolve identity
 * by email (which is UNIQUE) to ensure a stable user record across sessions.
 *
 * Returns the canonical user with the stable database ID.
 */
function ensureUserExists(user: AuthenticatedUser): AuthenticatedUser {
  // First, check if a user with this email already exists (stable identity)
  const existingByEmail = db
    .select({ id: users.id, email: users.email, name: users.name, image: users.image })
    .from(users)
    .where(eq(users.email, user.email))
    .get();

  if (existingByEmail) {
    // Update profile fields that may have changed (name, avatar)
    if (existingByEmail.name !== user.name || existingByEmail.image !== user.image) {
      db.update(users)
        .set({ name: user.name ?? null, image: user.image ?? null })
        .where(eq(users.id, existingByEmail.id))
        .run();
    }
    // Return the canonical user with the stable database ID
    return { ...user, id: existingByEmail.id };
  }

  // No existing user — create a new one with the session-provided ID
  db.insert(users)
    .values({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
    })
    .run();

  return user;
}

/**
 * Get the authenticated user from the current session.
 * In E2E mode, returns a deterministic test user.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthenticatedUser | null> {
  if (E2E_SKIP_AUTH) return E2E_USER;

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
}

/**
 * Require authentication for an API route.
 * Returns the user if authenticated, or a 401 JSON response.
 * Also ensures the user row exists in the database for FK constraints.
 */
export async function requireAuth(): Promise<
  | { user: AuthenticatedUser; error?: never }
  | { user?: never; error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  // Ensure user exists in DB (JWT sessions don't persist users automatically).
  // The returned user has the stable database ID (not the random JWT UUID).
  const canonicalUser = ensureUserExists(user);

  return { user: canonicalUser };
}

/**
 * Require authentication AND validate a watchlist ID from route params.
 * Returns the authenticated user and watchlist, or a JSON error response.
 */
export async function requireAuthWithWatchlist(
  params: Promise<{ id: string }> | { id: string },
): Promise<
  | { user: AuthenticatedUser; watchlistId: number; error?: never }
  | { user?: never; watchlistId?: never; error: NextResponse }
> {
  const { user, error } = await requireAuth();
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

  // Lazy import to avoid circular deps
  const { findByIdAndUserId } = await import("@/db/repositories/watchlists");
  const watchlist = findByIdAndUserId(watchlistId, user.id);
  if (!watchlist) {
    return {
      error: NextResponse.json(
        { error: "Watchlist not found" },
        { status: 404 },
      ),
    };
  }

  return { user, watchlistId };
}
