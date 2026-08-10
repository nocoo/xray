/**
 * Centralized guard for the E2E auth bypass.
 *
 * `E2E_SKIP_AUTH=true` makes `requireAuth()` return a deterministic
 * `ScopedDB("e2e-test-user")` without checking the session, and tells
 * the proxy + NextAuth `signIn` callback to skip the email allowlist.
 * If that env var ever reached a production deploy, every API route
 * protected by `requireAuth()` would silently fall through to a
 * write-capable seed user — see STU-643.
 *
 * The bypass is only honored when EITHER:
 *   1. `NODE_ENV !== "production"` — dev / test / vitest runs, or
 *   2. `E2E_TEST_RUNNER === "true"` — the L3 Playwright runner builds
 *      and starts vinext with `NODE_ENV=production` to avoid hydration
 *      flake, so it must opt in explicitly.
 *
 * The production Dockerfile pins `NODE_ENV=production` and does NOT
 * set `E2E_TEST_RUNNER`, so an accidentally-injected `E2E_SKIP_AUTH`
 * at runtime cannot grant `e2e-test-user` access in prod.
 */
export function isE2EAuthBypass(): boolean {
  if (process.env.E2E_SKIP_AUTH !== "true") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.E2E_TEST_RUNNER === "true";
}
