// =============================================================================
// Integration Test Helper - Creates app with MockTwitterProvider
// =============================================================================

import { createApp } from "../../../src/app";
import { MockTwitterProvider } from "../../../src/providers/mock/client";

export function createTestApp() {
  const provider = new MockTwitterProvider();
  const app = createApp({ twitterProvider: provider });
  return { app, provider };
}
