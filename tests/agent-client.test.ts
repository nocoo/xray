import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { getAgentClient } from "../agent/lib/agent-api";

describe("agent/lib/agent-api", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("creates client that can perform API call", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ code: 201, msg: "ok", data: { list: [] } }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = await getAgentClient();
    const result = await client.searchTweets("AI", 1, true);

    expect(Array.isArray(result)).toBe(true);
  });
});
