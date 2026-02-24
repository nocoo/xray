import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
 */
function ensureUserExists(user: AuthenticatedUser): void {
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .get();

  if (!existing) {
    db.insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
      })
      .run();
  }
}

/**
 * Get the authenticated user from the current session.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthenticatedUser | null> {
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

  // Ensure user exists in DB (JWT sessions don't persist users automatically)
  ensureUserExists(user);

  return { user };
}
