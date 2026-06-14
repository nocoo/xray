import { describe, test, expect, afterEach, vi } from "vitest";
import { isE2EAuthBypass } from "@/lib/e2e-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isE2EAuthBypass", () => {
  test("returns false when E2E_SKIP_AUTH is unset", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isE2EAuthBypass()).toBe(false);
  });

  test("returns false when E2E_SKIP_AUTH is not exactly 'true'", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isE2EAuthBypass()).toBe(false);
  });

  test("returns true when E2E_SKIP_AUTH=true in development", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(isE2EAuthBypass()).toBe(true);
  });

  test("returns true when E2E_SKIP_AUTH=true in test", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "true");
    vi.stubEnv("NODE_ENV", "test");
    expect(isE2EAuthBypass()).toBe(true);
  });

  // The security fix: a stray E2E_SKIP_AUTH in prod must NOT bypass auth.
  test("returns false in production even when E2E_SKIP_AUTH=true", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_RUNNER", "");
    expect(isE2EAuthBypass()).toBe(false);
  });

  test("returns false in production when only E2E_TEST_RUNNER is set", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_RUNNER", "true");
    expect(isE2EAuthBypass()).toBe(false);
  });

  // The L3 Playwright runner builds a production-mode server but explicitly
  // opts in via E2E_TEST_RUNNER — that combination must still bypass.
  test("returns true in production when both flags opt in", () => {
    vi.stubEnv("E2E_SKIP_AUTH", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_RUNNER", "true");
    expect(isE2EAuthBypass()).toBe(true);
  });
});
