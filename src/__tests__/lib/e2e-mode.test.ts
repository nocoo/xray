import { describe, test, expect, afterEach, vi } from "vitest";
import { isE2EMode } from "@/lib/e2e-mode";

// =============================================================================
// E2E_SKIP_AUTH gate — production regression
//
// CVE-grade bug: if `E2E_SKIP_AUTH=true` is accidentally injected into a
// production deployment, the signIn callback returns true unconditionally and
// any Google account passes through ALLOWED_EMAILS. isE2EMode() requires
// either a non-production NODE_ENV or an explicit E2E_TEST_RUNNER=true marker.
// =============================================================================

describe("isE2EMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setEnv(env: {
    E2E_SKIP_AUTH?: string;
    E2E_TEST_RUNNER?: string;
    NODE_ENV?: string;
  }): void {
    vi.stubEnv("E2E_SKIP_AUTH", env.E2E_SKIP_AUTH);
    vi.stubEnv("E2E_TEST_RUNNER", env.E2E_TEST_RUNNER);
    vi.stubEnv("NODE_ENV", env.NODE_ENV);
  }

  test("returns false when E2E_SKIP_AUTH is unset", () => {
    setEnv({ NODE_ENV: "test" });
    expect(isE2EMode()).toBe(false);
  });

  test("returns false when E2E_SKIP_AUTH is not exactly 'true'", () => {
    setEnv({ E2E_SKIP_AUTH: "1", NODE_ENV: "test" });
    expect(isE2EMode()).toBe(false);
    setEnv({ E2E_SKIP_AUTH: "TRUE", NODE_ENV: "test" });
    expect(isE2EMode()).toBe(false);
  });

  test("returns true in non-production with E2E_SKIP_AUTH=true", () => {
    setEnv({ E2E_SKIP_AUTH: "true", NODE_ENV: "test" });
    expect(isE2EMode()).toBe(true);
    setEnv({ E2E_SKIP_AUTH: "true", NODE_ENV: "development" });
    expect(isE2EMode()).toBe(true);
  });

  // ---- production regression -------------------------------------------------

  test("returns false in production with bare E2E_SKIP_AUTH=true (no marker)", () => {
    setEnv({ E2E_SKIP_AUTH: "true", NODE_ENV: "production" });
    expect(isE2EMode()).toBe(false);
  });

  test("returns false in production when E2E_TEST_RUNNER is not exactly 'true'", () => {
    setEnv({
      E2E_SKIP_AUTH: "true",
      E2E_TEST_RUNNER: "1",
      NODE_ENV: "production",
    });
    expect(isE2EMode()).toBe(false);
  });

  test("returns true in production only when E2E_TEST_RUNNER=true marker is set", () => {
    setEnv({
      E2E_SKIP_AUTH: "true",
      E2E_TEST_RUNNER: "true",
      NODE_ENV: "production",
    });
    expect(isE2EMode()).toBe(true);
  });

  test("E2E_TEST_RUNNER alone (without E2E_SKIP_AUTH) does not enable bypass", () => {
    setEnv({ E2E_TEST_RUNNER: "true", NODE_ENV: "production" });
    expect(isE2EMode()).toBe(false);
  });
});
