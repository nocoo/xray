import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

// =============================================================================
// Mock the `ai` module's generateText
// =============================================================================

const mockGenerateText = mock(() =>
  Promise.resolve({ text: "[翻译]\n模拟翻译结果\n\n[锐评]\n这是一条锐评" }),
);

mock.module("ai", () => ({
  generateText: mockGenerateText,
}));

// =============================================================================
// Helpers
// =============================================================================

const BASE = "http://localhost/api/translate";

function jsonReq(body?: unknown) {
  return new Request(BASE, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function seedAiSettings(userId: string) {
  const scopedDb = new ScopedDB(userId);
  scopedDb.settings.upsert("ai.provider", "minimax");
  scopedDb.settings.upsert("ai.apiKey", "test-api-key-123");
  scopedDb.settings.upsert("ai.model", "MiniMax-M2.5");
}

// =============================================================================
// Tests
// =============================================================================

describe("POST /api/translate", () => {
  beforeEach(() => {
    createTestDb();
    process.env.E2E_SKIP_AUTH = "true";
    // getDb() in requireAuth uses XRAY_DB || "database/xray.db". Point it at
    // :memory: so it reuses the in-memory test DB instead of opening the
    // protected production file.
    process.env.XRAY_DB = ":memory:";
    db.insert(users)
      .values({ id: "e2e-test-user", name: "E2E Test User", email: "e2e@test.com" })
      .run();
    mockGenerateText.mockClear();
    mockGenerateText.mockImplementation(() =>
      Promise.resolve({ text: "[翻译]\n模拟翻译结果\n\n[锐评]\n这是一条锐评" }),
    );
  });

  afterEach(() => {
    closeDb();
    delete process.env.E2E_SKIP_AUTH;
    delete process.env.XRAY_DB;
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  test("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("@/app/api/translate/route");
    const req = new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON body");
  });

  test("returns 400 when text is missing", async () => {
    const { POST } = await import("@/app/api/translate/route");
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("text is required");
  });

  test("returns 400 when text is empty string", async () => {
    const { POST } = await import("@/app/api/translate/route");
    const res = await POST(jsonReq({ text: "   " }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("text is required");
  });

  test("returns 400 when text is not a string", async () => {
    const { POST } = await import("@/app/api/translate/route");
    const res = await POST(jsonReq({ text: 123 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("text is required");
  });

  // ---------------------------------------------------------------------------
  // AI not configured
  // ---------------------------------------------------------------------------

  test("returns 400 when AI provider is not configured", async () => {
    const { POST } = await import("@/app/api/translate/route");
    const res = await POST(jsonReq({ text: "Hello world" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("AI provider and API key must be configured");
  });

  // ---------------------------------------------------------------------------
  // Successful translation
  // ---------------------------------------------------------------------------

  test("translates text and returns result", async () => {
    const { POST } = await import("@/app/api/translate/route");
    seedAiSettings("e2e-test-user");

    const res = await POST(jsonReq({ text: "Hello world" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.translatedText).toBe("模拟翻译结果");
    expect(data.data.commentText).toBe("这是一条锐评");
    expect(data.data.quotedTranslatedText).toBeNull();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  test("translates with quoted text", async () => {
    const { POST } = await import("@/app/api/translate/route");
    seedAiSettings("e2e-test-user");
    mockGenerateText.mockImplementation(() =>
      Promise.resolve({
        text: "[翻译]\n主翻译\n\n[引用翻译]\n引用翻译结果\n\n[锐评]\n综合锐评",
      }),
    );

    const res = await POST(jsonReq({ text: "My take", quotedText: "Original tweet" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.translatedText).toBe("主翻译");
    expect(data.data.quotedTranslatedText).toBe("引用翻译结果");
    expect(data.data.commentText).toBe("综合锐评");
  });

  test("ignores empty quotedText", async () => {
    const { POST } = await import("@/app/api/translate/route");
    seedAiSettings("e2e-test-user");

    const res = await POST(jsonReq({ text: "Hello", quotedText: "  " }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify the prompt did NOT include the quoted text section
    const calls = mockGenerateText.mock.calls;
    const call = (calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call.prompt).not.toContain("引用原文");
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  test("returns 500 when AI SDK throws unexpected error", async () => {
    const { POST } = await import("@/app/api/translate/route");
    seedAiSettings("e2e-test-user");
    mockGenerateText.mockImplementation(() =>
      Promise.reject(new Error("Rate limit exceeded")),
    );

    const res = await POST(jsonReq({ text: "Hello" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("Translation failed");
  });
});
