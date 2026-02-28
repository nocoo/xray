import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as settingsRepo from "@/db/repositories/settings";

// =============================================================================
// Mock the `ai` module's generateText
// =============================================================================

const mockGenerateText = mock(() =>
  Promise.resolve({ text: "模拟翻译结果" }),
);

// Mock the `ai` module
mock.module("ai", () => ({
  generateText: mockGenerateText,
}));

// Import AFTER mocking
const { translateText, translateBatch } = await import(
  "@/services/translation"
);

// =============================================================================
// Helpers
// =============================================================================

function seedUser(id = "u1") {
  db.insert(users)
    .values({ id, name: "Test User", email: `${id}@example.com` })
    .run();
}

function seedAiSettings(userId = "u1") {
  settingsRepo.upsert(userId, "ai.provider", "minimax");
  settingsRepo.upsert(userId, "ai.apiKey", "test-api-key-123");
  settingsRepo.upsert(userId, "ai.model", "MiniMax-M2.5");
}

// =============================================================================
// Tests
// =============================================================================

describe("services/translation", () => {
  beforeEach(() => {
    createTestDb();
    seedUser("u1");
    mockGenerateText.mockClear();
    mockGenerateText.mockImplementation(() =>
      Promise.resolve({ text: "模拟翻译结果" }),
    );
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // translateText
  // ---------------------------------------------------------------------------

  describe("translateText", () => {
    test("translates text using AI config from settings", async () => {
      seedAiSettings("u1");

      const result = await translateText("u1", "Hello world");
      expect(result).toBe("模拟翻译结果");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      const calls = mockGenerateText.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = (calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(call.prompt).toContain("Hello world");
      expect(call.maxOutputTokens).toBe(1024);
    });

    test("throws when AI provider is not configured", async () => {
      // No AI settings seeded
      await expect(translateText("u1", "Hello")).rejects.toThrow(
        "AI provider and API key must be configured first",
      );
    });

    test("throws when only provider is set (no apiKey)", async () => {
      settingsRepo.upsert("u1", "ai.provider", "minimax");
      // No apiKey set

      await expect(translateText("u1", "Hello")).rejects.toThrow(
        "AI provider and API key must be configured first",
      );
    });

    test("trims whitespace from translation result", async () => {
      seedAiSettings("u1");
      mockGenerateText.mockImplementation(() =>
        Promise.resolve({ text: "  翻译结果有空格  \n" }),
      );

      const result = await translateText("u1", "Hello");
      expect(result).toBe("翻译结果有空格");
    });

    test("propagates AI SDK errors", async () => {
      seedAiSettings("u1");
      mockGenerateText.mockImplementation(() =>
        Promise.reject(new Error("Rate limit exceeded")),
      );

      await expect(translateText("u1", "Hello")).rejects.toThrow(
        "Rate limit exceeded",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // translateBatch
  // ---------------------------------------------------------------------------

  describe("translateBatch", () => {
    test("translates multiple posts", async () => {
      seedAiSettings("u1");

      const posts = [
        { id: 1, text: "Post one" },
        { id: 2, text: "Post two" },
        { id: 3, text: "Post three" },
      ];

      const result = await translateBatch("u1", posts);
      expect(result.translated).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(mockGenerateText).toHaveBeenCalledTimes(3);

      for (const t of result.translated) {
        expect(t.translatedText).toBe("模拟翻译结果");
      }
      expect(result.translated.map((t) => t.postId)).toEqual([1, 2, 3]);
    });

    test("collects errors without blocking other translations", async () => {
      seedAiSettings("u1");

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("AI error on post 2"));
        }
        return Promise.resolve({ text: "翻译OK" });
      });

      const posts = [
        { id: 10, text: "Post A" },
        { id: 20, text: "Post B" },
        { id: 30, text: "Post C" },
      ];

      const result = await translateBatch("u1", posts);
      expect(result.translated).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.postId).toBe(20);
      expect(result.errors[0]!.error).toBe("AI error on post 2");
    });

    test("returns empty results for empty input", async () => {
      seedAiSettings("u1");
      const result = await translateBatch("u1", []);
      expect(result.translated).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
