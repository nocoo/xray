// =============================================================================
// Unit Tests - Server Config
// =============================================================================

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadServerConfig } from "../../src/lib/config";

// Save original env vars to restore after each test
const originalEnv = { ...process.env };

function clearEnvVars() {
  delete process.env.PORT;
  delete process.env.MOCK_PROVIDER;
  delete process.env.CONFIG_PATH;
  delete process.env.TWEAPI_API_KEY;
  delete process.env.TWEAPI_BASE_URL;
  delete process.env.TWEAPI_COOKIE;
  delete process.env.TWEAPI_TIMEOUT_MS;
}

describe("loadServerConfig", () => {
  beforeEach(() => {
    clearEnvVars();
  });

  afterEach(() => {
    // Restore original env
    clearEnvVars();
    Object.assign(process.env, originalEnv);
  });

  test("returns default port 3456 when PORT is not set", () => {
    process.env.CONFIG_PATH = "/nonexistent/config.json"; // avoid loading real config
    const config = loadServerConfig();
    expect(config.port).toBe(3456);
  });

  test("respects PORT environment variable", () => {
    process.env.PORT = "8080";
    process.env.CONFIG_PATH = "/nonexistent/config.json";
    const config = loadServerConfig();
    expect(config.port).toBe(8080);
  });

  test("defaults to tweapi provider", () => {
    process.env.CONFIG_PATH = "/nonexistent/config.json";
    const config = loadServerConfig();
    expect(config.provider).toBe("tweapi");
  });

  test("selects mock provider when MOCK_PROVIDER=true", () => {
    process.env.MOCK_PROVIDER = "true";
    process.env.CONFIG_PATH = "/nonexistent/config.json";
    const config = loadServerConfig();
    expect(config.provider).toBe("mock");
  });

  test("uses env vars for TweAPI config", () => {
    process.env.CONFIG_PATH = "/nonexistent/config.json";
    process.env.TWEAPI_API_KEY = "test-key";
    process.env.TWEAPI_BASE_URL = "https://custom.api.io";
    process.env.TWEAPI_COOKIE = "cookie-value";
    process.env.TWEAPI_TIMEOUT_MS = "5000";
    const config = loadServerConfig();

    expect(config.tweapi.apiKey).toBe("test-key");
    expect(config.tweapi.baseUrl).toBe("https://custom.api.io");
    expect(config.tweapi.cookie).toBe("cookie-value");
    expect(config.tweapi.timeoutMs).toBe(5000);
  });

  test("defaults TweAPI base URL when not configured", () => {
    process.env.CONFIG_PATH = "/nonexistent/config.json";
    const config = loadServerConfig();
    expect(config.tweapi.baseUrl).toBe("https://api.tweapi.io");
  });

  test("defaults timeout to 30000ms", () => {
    process.env.CONFIG_PATH = "/nonexistent/config.json";
    const config = loadServerConfig();
    expect(config.tweapi.timeoutMs).toBe(30000);
  });

  test("gracefully handles non-existent config file", () => {
    process.env.CONFIG_PATH = "/this/does/not/exist.json";
    // Should not throw
    expect(() => loadServerConfig()).not.toThrow();
  });

  test("loads from real config file when it exists", () => {
    // Use the actual project config file
    const configPath = new URL("../../../config/config.json", import.meta.url).pathname;
    process.env.CONFIG_PATH = configPath;
    const config = loadServerConfig();
    // Should have loaded apiKey from file
    expect(config.tweapi.apiKey.length).toBeGreaterThan(0);
  });

  test("env vars take precedence over config file", () => {
    const configPath = new URL("../../../config/config.json", import.meta.url).pathname;
    process.env.CONFIG_PATH = configPath;
    process.env.TWEAPI_API_KEY = "env-override-key";
    const config = loadServerConfig();
    expect(config.tweapi.apiKey).toBe("env-override-key");
  });
});
