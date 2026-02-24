// =============================================================================
// Server Entry Point
// =============================================================================

import { createApp } from "./app";
import { loadServerConfig } from "./lib/config";
import { TweAPIProvider } from "./providers/tweapi/client";

const config = loadServerConfig();

// Select provider based on config
let provider;
if (config.provider === "mock") {
  // Dynamically import mock to avoid bundling it in production
  const { MockTwitterProvider } = await import("./providers/mock/client");
  provider = new MockTwitterProvider();
} else {
  provider = new TweAPIProvider(config.tweapi);
}

const app = createApp({ twitterProvider: provider });

console.log(`X-Ray API Server starting on port ${config.port}`);
console.log(`Provider: ${config.provider}`);
console.log(`Swagger UI: http://localhost:${config.port}/ui`);

export default {
  port: config.port,
  fetch: app.fetch,
};
