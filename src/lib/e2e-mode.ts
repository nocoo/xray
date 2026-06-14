/**
 * E2E auth-bypass gate. Returns true only when both:
 *   1. `E2E_SKIP_AUTH=true` is set, AND
 *   2. We are NOT running in production, OR an explicit `E2E_TEST_RUNNER=true`
 *      marker is set (covers production-build E2E suites like Playwright CI).
 *
 * Production deployments must never bypass auth on a bare `E2E_SKIP_AUTH=true`
 * — that would let any Google account through the signIn callback regardless
 * of `ALLOWED_EMAILS`.
 */
export function isE2EMode(): boolean {
  if (process.env.E2E_SKIP_AUTH !== "true") return false;
  if (process.env.NODE_ENV === "production" && process.env.E2E_TEST_RUNNER !== "true") {
    return false;
  }
  return true;
}
