import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "bun:test";
import { setupE2E, teardownE2E, apiRequest } from "./setup";

// =============================================================================
// E2E Tests — AI Settings CRUD
//
// Tests the full lifecycle of AI settings via HTTP API:
// GET (empty) → PUT (configure) → GET (verify, key masked) →
// PUT (partial update) → GET (verify) → PUT (clear) → GET (empty)
//
// Test Connection is NOT tested here — it requires a real AI API key.
// =============================================================================

describe("e2e: ai settings", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // GET — empty state
  // ---------------------------------------------------------------------------

  test("GET /api/settings/ai returns empty config initially", async () => {
    const { status, data } = await apiRequest<{
      provider: string;
      apiKey: string;
      hasApiKey: boolean;
      model: string;
      baseURL: string;
      sdkType: string;
    }>("/api/settings/ai");

    expect(status).toBe(200);
    expect(data.provider).toBe("");
    expect(data.apiKey).toBe("");
    expect(data.hasApiKey).toBe(false);
    expect(data.model).toBe("");
    expect(data.baseURL).toBe("");
    expect(data.sdkType).toBe("");
  });

  // ---------------------------------------------------------------------------
  // PUT — configure built-in provider
  // ---------------------------------------------------------------------------

  test("PUT /api/settings/ai configures anthropic provider", async () => {
    const { status, data } = await apiRequest<{
      provider: string;
      apiKey: string;
      hasApiKey: boolean;
      model: string;
      baseURL: string;
      sdkType: string;
    }>("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify({
        provider: "anthropic",
        apiKey: "sk-ant-test-key-1234567890",
        model: "claude-sonnet-4-20250514",
      }),
    });

    expect(status).toBe(200);
    expect(data.provider).toBe("anthropic");
    expect(data.hasApiKey).toBe(true);
    // API key should be masked — only last 4 chars visible
    expect(data.apiKey).toContain("7890");
    expect(data.apiKey).toContain("*");
    expect(data.apiKey).not.toBe("sk-ant-test-key-1234567890");
    expect(data.model).toBe("claude-sonnet-4-20250514");
  });

  // ---------------------------------------------------------------------------
  // GET — verify persisted config
  // ---------------------------------------------------------------------------

  test("GET /api/settings/ai returns configured settings", async () => {
    const { status, data } = await apiRequest<{
      provider: string;
      apiKey: string;
      hasApiKey: boolean;
      model: string;
    }>("/api/settings/ai");

    expect(status).toBe(200);
    expect(data.provider).toBe("anthropic");
    expect(data.hasApiKey).toBe(true);
    expect(data.model).toBe("claude-sonnet-4-20250514");
  });

  // ---------------------------------------------------------------------------
  // PUT — partial update (only change model)
  // ---------------------------------------------------------------------------

  test("PUT /api/settings/ai supports partial update", async () => {
    const { status, data } = await apiRequest<{
      provider: string;
      model: string;
      hasApiKey: boolean;
    }>("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify({ model: "claude-3-haiku-20240307" }),
    });

    expect(status).toBe(200);
    // Provider and apiKey should be preserved
    expect(data.provider).toBe("anthropic");
    expect(data.hasApiKey).toBe(true);
    // Model should be updated
    expect(data.model).toBe("claude-3-haiku-20240307");
  });

  // ---------------------------------------------------------------------------
  // PUT — configure custom provider
  // ---------------------------------------------------------------------------

  test("PUT /api/settings/ai configures custom provider", async () => {
    const { status, data } = await apiRequest<{
      provider: string;
      model: string;
      baseURL: string;
      sdkType: string;
      hasApiKey: boolean;
    }>("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify({
        provider: "custom",
        apiKey: "sk-custom-key-abcdefgh",
        model: "my-custom-model",
        baseURL: "https://my-api.example.com/v1",
        sdkType: "openai",
      }),
    });

    expect(status).toBe(200);
    expect(data.provider).toBe("custom");
    expect(data.model).toBe("my-custom-model");
    expect(data.baseURL).toBe("https://my-api.example.com/v1");
    expect(data.sdkType).toBe("openai");
    expect(data.hasApiKey).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Validation errors
  // ---------------------------------------------------------------------------

  test("PUT /api/settings/ai rejects invalid provider", async () => {
    const { status, data } = await apiRequest<{ error: string }>(
      "/api/settings/ai",
      {
        method: "PUT",
        body: JSON.stringify({ provider: "invalid-provider" }),
      },
    );

    expect(status).toBe(400);
    expect(data.error).toContain("Invalid provider");
  });

  test("PUT /api/settings/ai rejects invalid sdkType", async () => {
    const { status, data } = await apiRequest<{ error: string }>(
      "/api/settings/ai",
      {
        method: "PUT",
        body: JSON.stringify({ sdkType: "invalid-sdk" }),
      },
    );

    expect(status).toBe(400);
    expect(data.error).toContain("Invalid SDK type");
  });

  test("PUT /api/settings/ai rejects invalid JSON body", async () => {
    const res = await fetch(
      `http://localhost:17027/api/settings/ai`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  // ---------------------------------------------------------------------------
  // PUT — clear settings
  // ---------------------------------------------------------------------------

  test("PUT /api/settings/ai can clear all fields", async () => {
    const { status, data } = await apiRequest<{
      provider: string;
      apiKey: string;
      hasApiKey: boolean;
      model: string;
      baseURL: string;
      sdkType: string;
    }>("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify({
        provider: "",
        apiKey: "",
        model: "",
        baseURL: "",
        sdkType: "",
      }),
    });

    expect(status).toBe(200);
    expect(data.provider).toBe("");
    expect(data.apiKey).toBe("");
    expect(data.hasApiKey).toBe(false);
    expect(data.model).toBe("");
    expect(data.baseURL).toBe("");
    expect(data.sdkType).toBe("");
  });

  // ---------------------------------------------------------------------------
  // Test connection — precondition check (no real AI call)
  // ---------------------------------------------------------------------------

  test("POST /api/settings/ai/test returns 400 when not configured", async () => {
    const { status, data } = await apiRequest<{ error: string }>(
      "/api/settings/ai/test",
      { method: "POST" },
    );

    expect(status).toBe(400);
    expect(data.error).toContain("must be configured");
  });
});
