/**
 * AI service module.
 *
 * Provides configurable AI provider integration via Vercel AI SDK.
 * Supports both OpenAI and Anthropic SDK protocols.
 * Includes built-in providers (Anthropic, MiniMax, GLM, AIHubMix) and a
 * "custom" provider where users supply their own base URL and SDK type.
 *
 * This module is self-contained and has no dependency on other X-Ray business
 * modules. It only depends on the Vercel AI SDK packages.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

// ── Types ──

export type SdkType = "anthropic" | "openai";

export type AiProvider =
  | "anthropic"
  | "minimax"
  | "glm"
  | "aihubmix"
  | "custom";

export interface AiProviderInfo {
  id: AiProvider;
  label: string;
  baseURL: string;
  sdkType: SdkType;
  models: string[];
  defaultModel: string;
}

export interface AiConfig {
  provider: AiProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  sdkType: SdkType;
}

/** User-facing settings stored in the settings KV table. */
export interface AiSettingsInput {
  provider: AiProvider;
  apiKey: string;
  model: string; // empty = use provider default
  /** Only used when provider === "custom" */
  baseURL?: string | undefined;
  /** Only used when provider === "custom" */
  sdkType?: SdkType | undefined;
}

// ── Provider registry ──

export const AI_PROVIDERS: Record<
  Exclude<AiProvider, "custom">,
  AiProviderInfo
> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    sdkType: "anthropic",
    models: ["claude-sonnet-4-20250514"],
    defaultModel: "claude-sonnet-4-20250514",
  },
  minimax: {
    id: "minimax",
    label: "MiniMax",
    baseURL: "https://api.minimaxi.com/anthropic/v1",
    sdkType: "anthropic",
    models: ["MiniMax-M2.5", "MiniMax-M2.1"],
    defaultModel: "MiniMax-M2.5",
  },
  glm: {
    id: "glm",
    label: "GLM (Zhipu)",
    baseURL: "https://open.bigmodel.cn/api/anthropic/v1",
    sdkType: "anthropic",
    models: ["glm-5", "glm-4.7"],
    defaultModel: "glm-5",
  },
  aihubmix: {
    id: "aihubmix",
    label: "AIHubMix",
    baseURL: "https://aihubmix.com/v1",
    sdkType: "openai",
    models: ["gpt-4o-mini", "gpt-5-nano"],
    defaultModel: "gpt-4o-mini",
  },
};

/** Custom provider sentinel — baseURL and sdkType supplied by user. */
export const CUSTOM_PROVIDER_INFO: Omit<
  AiProviderInfo,
  "baseURL" | "sdkType"
> = {
  id: "custom",
  label: "Custom",
  models: [],
  defaultModel: "",
};

/** All valid provider IDs (including "custom"). */
export const ALL_PROVIDER_IDS: AiProvider[] = [
  ...(Object.keys(AI_PROVIDERS) as Exclude<AiProvider, "custom">[]),
  "custom",
];

// ── Provider helpers ──

/**
 * Look up a built-in provider's static config.
 */
export function getProviderConfig(
  providerId: AiProvider,
): AiProviderInfo | undefined {
  if (providerId === "custom") return undefined;
  return AI_PROVIDERS[providerId];
}

/**
 * Check if a provider ID is valid (built-in or custom).
 */
export function isValidProvider(id: string): id is AiProvider {
  return ALL_PROVIDER_IDS.includes(id as AiProvider);
}

// ── Config resolution ──

/**
 * Resolve user settings into a complete AiConfig.
 * Fills in baseURL, sdkType, and default model from the provider registry.
 * For "custom" provider, baseURL and sdkType must be supplied in the input.
 */
export function resolveAiConfig(input: AiSettingsInput): AiConfig {
  if (!input.apiKey) {
    throw new Error("API key is required");
  }

  if (input.provider === "custom") {
    if (!input.baseURL) {
      throw new Error("Base URL is required for custom provider");
    }
    if (!input.sdkType) {
      throw new Error("SDK type is required for custom provider");
    }
    if (!input.model) {
      throw new Error("Model is required for custom provider");
    }
    return {
      provider: "custom",
      baseURL: input.baseURL,
      apiKey: input.apiKey,
      model: input.model,
      sdkType: input.sdkType,
    };
  }

  const info = getProviderConfig(input.provider);
  if (!info) {
    throw new Error(`Unknown AI provider: ${input.provider}`);
  }

  return {
    provider: input.provider,
    baseURL: info.baseURL,
    apiKey: input.apiKey,
    model: input.model || info.defaultModel,
    sdkType: info.sdkType,
  };
}

// ── Client creation ──

/**
 * Create a Vercel AI SDK provider instance based on sdkType.
 * Returns a function: `client(modelId) -> LanguageModelV2`.
 *
 * When sdkType is "anthropic", uses @ai-sdk/anthropic.
 * When sdkType is "openai", uses @ai-sdk/openai.
 */
export function createAiClient(config: AiConfig) {
  if (config.sdkType === "openai") {
    return createOpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    });
  }
  return createAnthropic({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}
