import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as settingsRepo from "@/db/repositories/settings";

// =============================================================================
// Mock the `ai` module's generateText
// =============================================================================

const mockGenerateText = mock(() =>
  Promise.resolve({ text: "[翻译]\n模拟翻译结果\n\n[锐评]\n这是一条锐评" }),
);

// Mock the `ai` module
mock.module("ai", () => ({
  generateText: mockGenerateText,
}));

// Import AFTER mocking
const { translateText, translateBatch, parseTranslationResponse } = await import(
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
      Promise.resolve({ text: "[翻译]\n模拟翻译结果\n\n[锐评]\n这是一条锐评" }),
    );
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // parseTranslationResponse
  // ---------------------------------------------------------------------------

  describe("parseTranslationResponse", () => {
    test("parses response with both markers", () => {
      const raw = "[翻译]\n你好世界\n\n[锐评]\n很有意思的一条推文";
      const result = parseTranslationResponse(raw);
      expect(result.translatedText).toBe("你好世界");
      expect(result.commentText).toBe("很有意思的一条推文");
    });

    test("parses response with only translate marker", () => {
      const raw = "[翻译]\n你好世界";
      const result = parseTranslationResponse(raw);
      expect(result.translatedText).toBe("你好世界");
      expect(result.commentText).toBe("");
    });

    test("falls back to entire text as translation when no markers", () => {
      const raw = "这是一段没有标记的翻译";
      const result = parseTranslationResponse(raw);
      expect(result.translatedText).toBe("这是一段没有标记的翻译");
      expect(result.commentText).toBe("");
    });

    test("handles multiline content in both sections", () => {
      const raw = "[翻译]\n第一行\n第二行\n\n[锐评]\n锐评第一行\n锐评第二行";
      const result = parseTranslationResponse(raw);
      expect(result.translatedText).toBe("第一行\n第二行");
      expect(result.commentText).toBe("锐评第一行\n锐评第二行");
    });

    test("handles extra whitespace around markers", () => {
      const raw = "  [翻译]  \n  翻译内容  \n\n  [锐评]  \n  锐评内容  ";
      const result = parseTranslationResponse(raw);
      expect(result.translatedText).toBe("翻译内容");
      expect(result.commentText).toBe("锐评内容");
    });
  });

  // ---------------------------------------------------------------------------
  // translateText
  // ---------------------------------------------------------------------------

  describe("translateText", () => {
    test("translates text and returns parsed result", async () => {
      seedAiSettings("u1");

      const result = await translateText("u1", "Hello world");
      expect(result.translatedText).toBe("模拟翻译结果");
      expect(result.commentText).toBe("这是一条锐评");
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

    test("handles response without markers gracefully", async () => {
      seedAiSettings("u1");
      mockGenerateText.mockImplementation(() =>
        Promise.resolve({ text: "  纯翻译结果无标记  \n" }),
      );

      const result = await translateText("u1", "Hello");
      expect(result.translatedText).toBe("纯翻译结果无标记");
      expect(result.commentText).toBe("");
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
    test("translates multiple posts with translation and comment", async () => {
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
        expect(t.commentText).toBe("这是一条锐评");
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
        return Promise.resolve({ text: "[翻译]\n翻译OK\n\n[锐评]\n评论OK" });
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

      for (const t of result.translated) {
        expect(t.translatedText).toBe("翻译OK");
        expect(t.commentText).toBe("评论OK");
      }
    });

    test("returns empty results for empty input", async () => {
      seedAiSettings("u1");
      const result = await translateBatch("u1", []);
      expect(result.translated).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
