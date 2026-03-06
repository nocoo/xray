import { describe, test, expect } from "bun:test";
import { renderPrompt } from "@/services/translation";
import { DEFAULT_TRANSLATION_TEMPLATE } from "@/services/prompt-defaults";

describe("renderPrompt", () => {
  test("substitutes {{推文内容}} and removes conditional block when no quote", () => {
    const result = renderPrompt(DEFAULT_TRANSLATION_TEMPLATE, {
      推文内容: "Hello world",
    });

    expect(result).toContain("Hello world");
    expect(result).not.toContain("{{推文内容}}");
    expect(result).not.toContain("{{#引用原文}}");
    expect(result).not.toContain("{{/引用原文}}");
    expect(result).not.toContain("{{引用原文}}");
    // Conditional content should be removed
    expect(result).not.toContain("任务二：翻译引用原文");
    expect(result).not.toContain("[引用翻译]");
  });

  test("renders conditional block when quotedText is provided", () => {
    const result = renderPrompt(DEFAULT_TRANSLATION_TEMPLATE, {
      推文内容: "My comment on this",
      引用原文: "Original tweet content",
    });

    expect(result).toContain("My comment on this");
    expect(result).toContain("Original tweet content");
    expect(result).not.toContain("{{推文内容}}");
    expect(result).not.toContain("{{引用原文}}");
    expect(result).not.toContain("{{#引用原文}}");
    expect(result).not.toContain("{{/引用原文}}");
    // Conditional content should be kept
    expect(result).toContain("任务二：翻译引用原文");
    expect(result).toContain("[引用翻译]");
  });

  test("works with custom template", () => {
    const custom = "Translate: {{推文内容}}\n{{#引用原文}}Quote: {{引用原文}}{{/引用原文}}";

    const withoutQuote = renderPrompt(custom, { 推文内容: "Hello" });
    expect(withoutQuote).toBe("Translate: Hello");

    const withQuote = renderPrompt(custom, { 推文内容: "Hello", 引用原文: "World" });
    expect(withQuote).toBe("Translate: Hello\nQuote: World");
  });

  test("falls back to default when template is empty", () => {
    const result = renderPrompt("", { 推文内容: "Test" });
    expect(result).toContain("Test");
    expect(result).toContain("信达雅");
  });

  test("falls back to default when template is only whitespace", () => {
    const result = renderPrompt("   \n  ", { 推文内容: "Test" });
    expect(result).toContain("Test");
    expect(result).toContain("信达雅");
  });

  test("falls back to default when template is missing {{推文内容}}", () => {
    const result = renderPrompt("This template has no variable placeholders", {
      推文内容: "Test",
    });
    // Should use default since {{推文内容}} is missing
    expect(result).toContain("Test");
    expect(result).toContain("信达雅");
  });

  test("removes conditional block content when 引用原文 is empty string", () => {
    const result = renderPrompt(DEFAULT_TRANSLATION_TEMPLATE, {
      推文内容: "Hello",
      引用原文: "",
    });

    expect(result).not.toContain("任务二：翻译引用原文");
    expect(result).not.toContain("[引用翻译]");
  });

  test("leaves unknown variables as-is", () => {
    const custom = "{{推文内容}} and {{unknown_var}}";
    const result = renderPrompt(custom, { 推文内容: "Hello" });
    expect(result).toBe("Hello and {{unknown_var}}");
  });

  test("substitutes multiple occurrences of the same variable", () => {
    const custom = "First: {{推文内容}}\nSecond: {{推文内容}}";
    const result = renderPrompt(custom, { 推文内容: "Hello" });
    expect(result).toBe("First: Hello\nSecond: Hello");
  });

  test("handles special regex characters in tweet content", () => {
    const result = renderPrompt(DEFAULT_TRANSLATION_TEMPLATE, {
      推文内容: "Price is $100 (50% off) [limited]",
    });
    expect(result).toContain("Price is $100 (50% off) [limited]");
  });
});
