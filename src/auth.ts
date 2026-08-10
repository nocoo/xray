import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { Adapter } from "@auth/core/adapters";
import { isE2EAuthBypass } from "@/lib/e2e-mode";

// Get allowed emails from environment variable
const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// For reverse proxy environments with HTTPS, we need secure cookies
const useSecureCookies =
  process.env.NODE_ENV === "production" ||
  process.env.NEXTAUTH_URL?.startsWith("https://") ||
  process.env.USE_SECURE_COOKIES === "true";

// Lazy-load the SQLite adapter. This fails gracefully in middleware/edge
// environments where bun:sqlite is unavailable — NextAuth falls back to
// JWT-only mode (sufficient for token verification in proxy.ts).
// The adapter is only needed during OAuth callback (/api/auth/[...nextauth])
// to persist user + account rows on sign-in.
let adapter: Adapter | undefined;
try {
  const { SqliteAdapter } = await import("@/lib/auth-adapter");
  adapter = SqliteAdapter();
} catch {
  // Expected in middleware — bun:sqlite not available
}

/** Shared config — route handlers call Auth() with this to avoid next-auth's broken reqWithEnvURL. */
export const authConfig = {
  // vinext hangs reading POST bodies under /api/auth/* — use a different prefix.
  basePath: "/api/xauth",
  trustHost: true,
  adapter,
  // Use JWT strategy even with adapter — avoids per-request DB session lookups.
  // The adapter handles user creation + account linking on OAuth sign-in only.
  session: { strategy: "jwt" as const },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    pkceCodeVerifier: {
      name: useSecureCookies
        ? "__Secure-authjs.pkce.code_verifier"
        : "authjs.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: useSecureCookies,
      },
    },
    state: {
      name: useSecureCookies ? "__Secure-authjs.state" : "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: useSecureCookies
        ? "__Secure-authjs.callback-url"
        : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: useSecureCookies,
      },
    },
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ user }) {
      // Skip email check in E2E test environment (guarded — see e2e-mode.ts).
      if (isE2EAuthBypass()) return true;

      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails.includes(email)) {
        return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      // On initial sign-in, persist user info into the JWT
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose user ID from JWT in the session for multi-tenant scoping
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
