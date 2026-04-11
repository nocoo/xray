/**
 * Test setup file - preloaded before any test runs
 *
 * Creates mock config files needed by scripts that call loadAPIKeyConfig()
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const configDir = join(process.cwd(), "config");

// Ensure config directory exists
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

// Create mock api-key.json if missing
const apiKeyPath = join(configDir, "api-key.json");
if (!existsSync(apiKeyPath)) {
  writeFileSync(
    apiKeyPath,
    JSON.stringify(
      { base_url: "http://localhost:9999", webhook_key: "test-key" },
      null,
      2
    )
  );
}

// Create mock config.json if missing
const configPath = join(configDir, "config.json");
if (!existsSync(configPath)) {
  const mockConfig = {
    api: {
      api_key: "test-api-key",
      base_url: "http://localhost:9999",
    },
    me: {
      username: "testuser",
      is_blue_verified: false,
    },
    settings: {
      max_tweets_per_user: 20,
    },
    classification: {
      interests: [],
      filter_retweets_without_comment: false,
    },
  };
  writeFileSync(configPath, JSON.stringify(mockConfig, null, 2));
}
