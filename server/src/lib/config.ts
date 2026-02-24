// =============================================================================
// Server Configuration
// =============================================================================

import type { TweAPIConfig } from "../providers/tweapi/client";

export interface ServerConfig {
  port: number;
  provider: "tweapi" | "mock";
  tweapi: TweAPIConfig;
}

export function loadServerConfig(): ServerConfig {
  const port = Number(process.env.PORT) || 3456;
  const provider = (process.env.MOCK_PROVIDER === "true" ? "mock" : "tweapi") as ServerConfig["provider"];

  // Load from config file or env
  const configPath = process.env.CONFIG_PATH || new URL("../../../config/config.json", import.meta.url).pathname;

  let tweapiConfig: TweAPIConfig = {
    apiKey: process.env.TWEAPI_API_KEY || "",
    baseUrl: process.env.TWEAPI_BASE_URL || "https://api.tweapi.io",
    cookie: process.env.TWEAPI_COOKIE,
    timeoutMs: Number(process.env.TWEAPI_TIMEOUT_MS) || 30000,
  };

  // Try loading from config file
  try {
    const configText = require("fs").readFileSync(configPath, "utf-8");
    const fileConfig = JSON.parse(configText);
    if (fileConfig.api) {
      tweapiConfig = {
        apiKey: tweapiConfig.apiKey || fileConfig.api.api_key || "",
        baseUrl: tweapiConfig.baseUrl || fileConfig.api.base_url || "https://api.tweapi.io",
        cookie: tweapiConfig.cookie || fileConfig.api.cookie,
        timeoutMs: tweapiConfig.timeoutMs,
      };
    }
  } catch {
    // Config file not found, use env vars only
  }

  return { port, provider, tweapi: tweapiConfig };
}
