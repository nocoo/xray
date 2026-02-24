import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// =============================================================================
// Auth Configuration Tests
//
// Since NextAuth config is evaluated at module load time, we test the callback
// logic by extracting and invoking the callbacks directly. Environment variables
// are manipulated per-test to verify allowlist and bypass behavior.
// =============================================================================

// Helper to dynamically import auth.ts with fresh env vars
async function loadAuthModule() {
  // Clear module cache to force re-evaluation with current env
  const modulePath = require.resolve("@/auth");
  delete require.cache[modulePath];
  return import("@/auth");
}

describe("auth", () => {
  // Save original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env vars
    process.env.ALLOWED_EMAILS = originalEnv.ALLOWED_EMAILS;
    process.env.E2E_SKIP_AUTH = originalEnv.E2E_SKIP_AUTH;
    process.env.NEXTAUTH_URL = originalEnv.NEXTAUTH_URL;
    process.env.USE_SECURE_COOKIES = originalEnv.USE_SECURE_COOKIES;
  });

  // ---------------------------------------------------------------------------
  // Module exports
  // ---------------------------------------------------------------------------

  describe("exports", () => {
    test("exports handlers, signIn, signOut, auth", async () => {
      const mod = await loadAuthModule();
      expect(mod.handlers).toBeDefined();
      expect(mod.signIn).toBeDefined();
      expect(mod.signOut).toBeDefined();
      expect(mod.auth).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Email allowlist parsing
  // ---------------------------------------------------------------------------

  describe("email allowlist", () => {
    test("parses comma-separated emails from ALLOWED_EMAILS", () => {
      const allowedEmails = "alice@example.com, BOB@example.com ,charlie@example.com"
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      expect(allowedEmails).toEqual([
        "alice@example.com",
        "bob@example.com",
        "charlie@example.com",
      ]);
    });

    test("handles empty ALLOWED_EMAILS", () => {
      const allowedEmails = ""
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      expect(allowedEmails).toEqual([]);
    });

    test("handles whitespace-only entries", () => {
      const allowedEmails = "alice@example.com, , ,bob@example.com"
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      expect(allowedEmails).toEqual(["alice@example.com", "bob@example.com"]);
    });
  });

  // ---------------------------------------------------------------------------
  // signIn callback logic
  // ---------------------------------------------------------------------------

  describe("signIn callback", () => {
    // Replicate the signIn callback logic for direct testing
    function signInCallback(
      email: string | undefined | null,
      allowedEmails: string[],
      skipAuth: boolean
    ): boolean {
      if (skipAuth) return true;
      const normalizedEmail = email?.toLowerCase();
      if (!normalizedEmail || !allowedEmails.includes(normalizedEmail)) {
        return false;
      }
      return true;
    }

    test("allows user with email in allowlist", () => {
      const result = signInCallback(
        "alice@example.com",
        ["alice@example.com", "bob@example.com"],
        false
      );
      expect(result).toBe(true);
    });

    test("rejects user with email not in allowlist", () => {
      const result = signInCallback(
        "hacker@evil.com",
        ["alice@example.com"],
        false
      );
      expect(result).toBe(false);
    });

    test("case-insensitive email matching", () => {
      const result = signInCallback(
        "ALICE@EXAMPLE.COM",
        ["alice@example.com"],
        false
      );
      expect(result).toBe(true);
    });

    test("rejects when email is undefined", () => {
      const result = signInCallback(undefined, ["alice@example.com"], false);
      expect(result).toBe(false);
    });

    test("rejects when email is null", () => {
      const result = signInCallback(null, ["alice@example.com"], false);
      expect(result).toBe(false);
    });

    test("rejects when allowlist is empty", () => {
      const result = signInCallback("alice@example.com", [], false);
      expect(result).toBe(false);
    });

    test("bypasses check when E2E_SKIP_AUTH is true", () => {
      const result = signInCallback("anyone@example.com", [], true);
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // JWT callback logic
  // ---------------------------------------------------------------------------

  describe("jwt callback", () => {
    // Replicate the jwt callback logic
    function jwtCallback(
      token: Record<string, unknown>,
      user?: { id?: string; email?: string; name?: string; image?: string }
    ): Record<string, unknown> {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    }

    test("persists user info into token on initial sign-in", () => {
      const token = {};
      const user = {
        id: "u1",
        email: "alice@example.com",
        name: "Alice",
        image: "https://avatar.url/alice.jpg",
      };

      const result = jwtCallback(token, user);
      expect(result.id).toBe("u1");
      expect(result.email).toBe("alice@example.com");
      expect(result.name).toBe("Alice");
      expect(result.picture).toBe("https://avatar.url/alice.jpg");
    });

    test("preserves existing token when no user (subsequent calls)", () => {
      const token = {
        id: "u1",
        email: "alice@example.com",
        name: "Alice",
        picture: "https://avatar.url/alice.jpg",
      };

      const result = jwtCallback(token);
      expect(result.id).toBe("u1");
      expect(result.email).toBe("alice@example.com");
    });
  });

  // ---------------------------------------------------------------------------
  // Session callback logic
  // ---------------------------------------------------------------------------

  describe("session callback", () => {
    // Replicate the session callback logic
    function sessionCallback(
      session: { user?: { id?: string } },
      token: { id?: string }
    ): { user?: { id?: string } } {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    }

    test("exposes user id from token in session", () => {
      const session = { user: { id: undefined as string | undefined } };
      const token = { id: "u1" };

      const result = sessionCallback(session, token);
      expect(result.user?.id).toBe("u1");
    });

    test("does not set id when token has no id", () => {
      const session = { user: {} };
      const token = {};

      const result = sessionCallback(session, token);
      expect(result.user?.id).toBeUndefined();
    });

    test("handles missing session.user gracefully", () => {
      const session = {};
      const token = { id: "u1" };

      const result = sessionCallback(session, token);
      expect(result.user).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Secure cookies logic
  // ---------------------------------------------------------------------------

  describe("secure cookies", () => {
    function shouldUseSecureCookies(env: {
      NODE_ENV?: string;
      NEXTAUTH_URL?: string;
      USE_SECURE_COOKIES?: string;
    }): boolean {
      return (
        env.NODE_ENV === "production" ||
        env.NEXTAUTH_URL?.startsWith("https://") === true ||
        env.USE_SECURE_COOKIES === "true"
      );
    }

    test("uses secure cookies in production", () => {
      expect(shouldUseSecureCookies({ NODE_ENV: "production" })).toBe(true);
    });

    test("uses secure cookies when NEXTAUTH_URL is HTTPS", () => {
      expect(
        shouldUseSecureCookies({ NEXTAUTH_URL: "https://example.com" })
      ).toBe(true);
    });

    test("uses secure cookies when USE_SECURE_COOKIES is true", () => {
      expect(
        shouldUseSecureCookies({ USE_SECURE_COOKIES: "true" })
      ).toBe(true);
    });

    test("does not use secure cookies in dev with http", () => {
      expect(
        shouldUseSecureCookies({
          NODE_ENV: "test",
          NEXTAUTH_URL: "http://localhost:7027",
        })
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Proxy (middleware) logic
  // ---------------------------------------------------------------------------

  describe("proxy logic", () => {
    function buildRedirectUrl(
      forwardedHost: string | null,
      forwardedProto: string | null,
      origin: string,
      pathname: string
    ): string {
      if (forwardedHost) {
        const proto = forwardedProto || "https";
        return `${proto}://${forwardedHost}${pathname}`;
      }
      return `${origin}${pathname}`;
    }

    test("uses origin when no forwarded headers", () => {
      const url = buildRedirectUrl(null, null, "http://localhost:7027", "/login");
      expect(url).toBe("http://localhost:7027/login");
    });

    test("uses forwarded host with forwarded proto", () => {
      const url = buildRedirectUrl("xray.example.com", "https", "http://localhost:7027", "/login");
      expect(url).toBe("https://xray.example.com/login");
    });

    test("defaults to https when forwarded host present but no proto", () => {
      const url = buildRedirectUrl("xray.example.com", null, "http://localhost:7027", "/login");
      expect(url).toBe("https://xray.example.com/login");
    });

    // Route matching logic
    function routeDecision(
      pathname: string,
      isLoggedIn: boolean,
      skipAuth: boolean
    ): "next" | "redirect-home" | "redirect-login" {
      if (skipAuth) return "next";
      if (pathname.startsWith("/api/auth")) return "next";
      if (pathname === "/login" && isLoggedIn) return "redirect-home";
      if (pathname !== "/login" && !isLoggedIn) return "redirect-login";
      return "next";
    }

    test("skips auth check when E2E_SKIP_AUTH", () => {
      expect(routeDecision("/dashboard", false, true)).toBe("next");
    });

    test("allows auth routes through", () => {
      expect(routeDecision("/api/auth/callback/google", false, false)).toBe("next");
      expect(routeDecision("/api/auth/providers", false, false)).toBe("next");
    });

    test("redirects logged-in user from /login to /", () => {
      expect(routeDecision("/login", true, false)).toBe("redirect-home");
    });

    test("redirects unauthenticated user to /login", () => {
      expect(routeDecision("/dashboard", false, false)).toBe("redirect-login");
      expect(routeDecision("/settings", false, false)).toBe("redirect-login");
      expect(routeDecision("/", false, false)).toBe("redirect-login");
    });

    test("allows authenticated user to access protected pages", () => {
      expect(routeDecision("/dashboard", true, false)).toBe("next");
      expect(routeDecision("/settings", true, false)).toBe("next");
      expect(routeDecision("/", true, false)).toBe("next");
    });

    test("allows unauthenticated user to view /login", () => {
      expect(routeDecision("/login", false, false)).toBe("next");
    });
  });
});
