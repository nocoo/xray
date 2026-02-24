import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema } from "@/db";
import * as credentialsRepo from "@/db/repositories/credentials";
import { createProviderForUser } from "@/lib/twitter/provider-factory";
import { MockTwitterProvider } from "@/lib/twitter/mock-provider";
import { TweAPIProvider } from "@/lib/twitter/tweapi-provider";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-factory";

beforeEach(() => {
  createTestDb();
  initSchema();
});

afterEach(() => {
  closeDb();
});

// =============================================================================
// Tests
// =============================================================================

describe("createProviderForUser", () => {
  test("returns MockTwitterProvider when MOCK_PROVIDER is set", () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    process.env.MOCK_PROVIDER = "true";
    try {
      const provider = createProviderForUser(TEST_USER_ID);
      expect(provider).toBeInstanceOf(MockTwitterProvider);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("returns null when user has no credentials and MOCK_PROVIDER is not set", () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    delete process.env.MOCK_PROVIDER;
    try {
      const provider = createProviderForUser(TEST_USER_ID);
      expect(provider).toBeNull();
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("returns null when user has credentials but no tweapi key", () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    delete process.env.MOCK_PROVIDER;
    try {
      credentialsRepo.upsert(TEST_USER_ID, {
        tweapiKey: null,
        twitterCookie: "some-cookie",
      });
      const provider = createProviderForUser(TEST_USER_ID);
      expect(provider).toBeNull();
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("returns TweAPIProvider when user has tweapi key", () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    delete process.env.MOCK_PROVIDER;
    try {
      credentialsRepo.upsert(TEST_USER_ID, {
        tweapiKey: "test-api-key",
        twitterCookie: "test-cookie",
      });
      const provider = createProviderForUser(TEST_USER_ID);
      expect(provider).toBeInstanceOf(TweAPIProvider);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("returns TweAPIProvider with cookie when user has both", () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    delete process.env.MOCK_PROVIDER;
    try {
      credentialsRepo.upsert(TEST_USER_ID, {
        tweapiKey: "test-api-key",
        twitterCookie: "test-cookie",
      });
      const provider = createProviderForUser(TEST_USER_ID);
      // Should be able to call public endpoints without error
      expect(provider).toBeInstanceOf(TweAPIProvider);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });
});
