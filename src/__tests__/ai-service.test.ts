/**
 * AI service tests.
 *
 * Tests the AI provider configuration, client creation, and config resolution.
 * Covers both built-in providers and the "custom" provider type.
 */

import { describe, expect, test } from "bun:test";
import {
  AI_PROVIDERS,
  ALL_PROVIDER_IDS,
  CUSTOM_PROVIDER_INFO,
  getProviderConfig,
  isValidProvider,
  resolveAiConfig,
  createAiClient,
  type AiProvider,
  type AiConfig,
} from "@/services/ai";

// =============================================================================
// Provider Registry
// =============================================================================

describe("AI_PROVIDERS", () => {
  test("has 4 built-in providers", () => {
    expect(Object.keys(AI_PROVIDERS)).toHaveLength(4);
  });

  test("each provider has required fields with valid values", () => {
    for (const [id, p] of Object.entries(AI_PROVIDERS)) {
      expect(id).toBe(p.id);
      expect(p.label).toBeTruthy();
      expect(p.baseURL).toMatch(/^https:\/\//);
      expect(p.sdkType).toMatch(/^(anthropic|openai)$/);
      expect(Array.isArray(p.models)).toBe(true);
      expect(p.models.length).toBeGreaterThan(0);
      expect(p.defaultModel).toBeTruthy();
      expect(p.models).toContain(p.defaultModel);
    }
  });

  test("contains expected provider ids", () => {
    const ids = Object.keys(AI_PROVIDERS);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("glm");
    expect(ids).toContain("minimax");
    expect(ids).toContain("aihubmix");
  });

  test("anthropic, minimax, glm use anthropic sdkType", () => {
    expect(AI_PROVIDERS.anthropic.sdkType).toBe("anthropic");
    expect(AI_PROVIDERS.minimax.sdkType).toBe("anthropic");
    expect(AI_PROVIDERS.glm.sdkType).toBe("anthropic");
  });

  test("aihubmix uses openai sdkType", () => {
    expect(AI_PROVIDERS.aihubmix.sdkType).toBe("openai");
  });

  test("providers have correct models", () => {
    expect(AI_PROVIDERS.anthropic.models).toContain("claude-sonnet-4-20250514");
    expect(AI_PROVIDERS.minimax.models).toContain("MiniMax-M2.5");
    expect(AI_PROVIDERS.minimax.models).toContain("MiniMax-M2.1");
    expect(AI_PROVIDERS.glm.models).toContain("glm-5");
    expect(AI_PROVIDERS.glm.models).toContain("glm-4.7");
    expect(AI_PROVIDERS.aihubmix.models).toContain("gpt-4o-mini");
    expect(AI_PROVIDERS.aihubmix.models).toContain("gpt-5-nano");
  });
});

describe("ALL_PROVIDER_IDS", () => {
  test("includes all built-in providers plus custom", () => {
    expect(ALL_PROVIDER_IDS).toContain("anthropic");
    expect(ALL_PROVIDER_IDS).toContain("minimax");
    expect(ALL_PROVIDER_IDS).toContain("glm");
    expect(ALL_PROVIDER_IDS).toContain("aihubmix");
    expect(ALL_PROVIDER_IDS).toContain("custom");
    expect(ALL_PROVIDER_IDS).toHaveLength(5);
  });
});

describe("CUSTOM_PROVIDER_INFO", () => {
  test("has id, label, empty models, empty defaultModel", () => {
    expect(CUSTOM_PROVIDER_INFO.id).toBe("custom");
    expect(CUSTOM_PROVIDER_INFO.label).toBe("Custom");
    expect(CUSTOM_PROVIDER_INFO.models).toEqual([]);
    expect(CUSTOM_PROVIDER_INFO.defaultModel).toBe("");
  });
});

// =============================================================================
// Provider Helpers
// =============================================================================

describe("isValidProvider", () => {
  test("returns true for built-in providers", () => {
    expect(isValidProvider("anthropic")).toBe(true);
    expect(isValidProvider("glm")).toBe(true);
    expect(isValidProvider("minimax")).toBe(true);
    expect(isValidProvider("aihubmix")).toBe(true);
  });

  test("returns true for custom", () => {
    expect(isValidProvider("custom")).toBe(true);
  });

  test("returns false for unknown strings", () => {
    expect(isValidProvider("invalid")).toBe(false);
    expect(isValidProvider("")).toBe(false);
  });
});

describe("getProviderConfig", () => {
  test("returns config for valid built-in provider", () => {
    const config = getProviderConfig("anthropic");
    expect(config).toBeDefined();
    expect(config!.id).toBe("anthropic");
    expect(config!.baseURL).toBe("https://api.anthropic.com/v1");
    expect(config!.sdkType).toBe("anthropic");
  });

  test("returns undefined for custom provider", () => {
    expect(getProviderConfig("custom")).toBeUndefined();
  });

  test("returns undefined for invalid provider", () => {
    expect(getProviderConfig("invalid" as AiProvider)).toBeUndefined();
  });
});

// =============================================================================
// Config Resolution
// =============================================================================

describe("resolveAiConfig", () => {
  test("uses provider defaults when model is empty", () => {
    const config = resolveAiConfig({
      provider: "anthropic",
      apiKey: "sk-test",
      model: "",
    });
    expect(config.baseURL).toBe("https://api.anthropic.com/v1");
    expect(config.model).toBe(AI_PROVIDERS.anthropic.defaultModel);
    expect(config.apiKey).toBe("sk-test");
    expect(config.sdkType).toBe("anthropic");
  });

  test("uses custom model when provided", () => {
    const config = resolveAiConfig({
      provider: "anthropic",
      apiKey: "sk-test",
      model: "claude-3-haiku-20240307",
    });
    expect(config.model).toBe("claude-3-haiku-20240307");
  });

  test("resolves different providers correctly", () => {
    const glm = resolveAiConfig({ provider: "glm", apiKey: "k", model: "" });
    expect(glm.baseURL).toBe("https://open.bigmodel.cn/api/anthropic/v1");
    expect(glm.sdkType).toBe("anthropic");

    const mm = resolveAiConfig({
      provider: "minimax",
      apiKey: "k",
      model: "",
    });
    expect(mm.baseURL).toBe("https://api.minimaxi.com/anthropic/v1");
    expect(mm.sdkType).toBe("anthropic");

    const hub = resolveAiConfig({
      provider: "aihubmix",
      apiKey: "k",
      model: "",
    });
    expect(hub.baseURL).toBe("https://aihubmix.com/v1");
    expect(hub.sdkType).toBe("openai");
  });

  test("resolves custom provider with all fields", () => {
    const config = resolveAiConfig({
      provider: "custom",
      apiKey: "sk-custom",
      model: "my-model",
      baseURL: "https://my-api.example.com/v1",
      sdkType: "openai",
    });
    expect(config.provider).toBe("custom");
    expect(config.baseURL).toBe("https://my-api.example.com/v1");
    expect(config.model).toBe("my-model");
    expect(config.sdkType).toBe("openai");
    expect(config.apiKey).toBe("sk-custom");
  });

  test("resolves custom provider with anthropic sdkType", () => {
    const config = resolveAiConfig({
      provider: "custom",
      apiKey: "sk-custom",
      model: "my-model",
      baseURL: "https://my-api.example.com/v1",
      sdkType: "anthropic",
    });
    expect(config.sdkType).toBe("anthropic");
  });

  // Error cases

  test("throws when provider is unknown", () => {
    expect(() =>
      resolveAiConfig({
        provider: "bad" as AiProvider,
        apiKey: "k",
        model: "",
      }),
    ).toThrow("Unknown AI provider");
  });

  test("throws when apiKey is empty", () => {
    expect(() =>
      resolveAiConfig({ provider: "anthropic", apiKey: "", model: "" }),
    ).toThrow("API key is required");
  });

  test("throws when custom provider missing baseURL", () => {
    expect(() =>
      resolveAiConfig({
        provider: "custom",
        apiKey: "k",
        model: "m",
        sdkType: "openai",
      }),
    ).toThrow("Base URL is required");
  });

  test("throws when custom provider missing sdkType", () => {
    expect(() =>
      resolveAiConfig({
        provider: "custom",
        apiKey: "k",
        model: "m",
        baseURL: "https://example.com",
      }),
    ).toThrow("SDK type is required");
  });

  test("throws when custom provider missing model", () => {
    expect(() =>
      resolveAiConfig({
        provider: "custom",
        apiKey: "k",
        model: "",
        baseURL: "https://example.com",
        sdkType: "openai",
      }),
    ).toThrow("Model is required");
  });
});

// =============================================================================
// Client Creation
// =============================================================================

describe("createAiClient", () => {
  test("creates an anthropic provider instance", () => {
    const config: AiConfig = {
      provider: "anthropic",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: "sk-test",
      model: "claude-sonnet-4-20250514",
      sdkType: "anthropic",
    };
    const client = createAiClient(config);
    expect(client).toBeDefined();
    expect(typeof client).toBe("function");
  });

  test("creates an openai provider instance", () => {
    const config: AiConfig = {
      provider: "aihubmix",
      baseURL: "https://aihubmix.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      sdkType: "openai",
    };
    const client = createAiClient(config);
    expect(client).toBeDefined();
    expect(typeof client).toBe("function");
  });

  test("creates client for custom provider with openai sdkType", () => {
    const config: AiConfig = {
      provider: "custom",
      baseURL: "https://my-api.example.com/v1",
      apiKey: "sk-test",
      model: "my-model",
      sdkType: "openai",
    };
    const client = createAiClient(config);
    expect(client).toBeDefined();
    expect(typeof client).toBe("function");
  });

  test("creates client for custom provider with anthropic sdkType", () => {
    const config: AiConfig = {
      provider: "custom",
      baseURL: "https://my-api.example.com/v1",
      apiKey: "sk-test",
      model: "my-model",
      sdkType: "anthropic",
    };
    const client = createAiClient(config);
    expect(client).toBeDefined();
    expect(typeof client).toBe("function");
  });
});
