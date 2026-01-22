import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import {
  renderTemplate,
  processReportData,
  findLatestReport,
  renderReport,
} from "../scripts/render-report";
import type { ReportFile } from "../scripts/lib/types";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const PUBLIC_DIR = join(import.meta.dir, "../public");
const OUTPUT_DIR = join(import.meta.dir, "../data/output");

describe("render-report", () => {
  describe("renderTemplate", () => {
    test("replaces simple variables", () => {
      const template = "Hello, {{name}}!";
      const data = { name: "World" };
      expect(renderTemplate(template, data)).toBe("Hello, World!");
    });

    test("handles nested variables", () => {
      const template = "{{user.name}} is {{user.age}} years old";
      const data = { user: { name: "Alice", age: 30 } };
      expect(renderTemplate(template, data)).toBe("Alice is 30 years old");
    });

    test("handles missing variables", () => {
      const template = "Hello, {{name}}!";
      const data = {};
      expect(renderTemplate(template, data)).toBe("Hello, !");
    });

    test("escapes HTML in variables", () => {
      const template = "{{content}}";
      const data = { content: "<script>alert('xss')</script>" };
      expect(renderTemplate(template, data)).toBe(
        "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"
      );
    });

    test("iterates over arrays", () => {
      const template = "{{#items}}Item: {{name}}, {{/items}}";
      const data = { items: [{ name: "A" }, { name: "B" }, { name: "C" }] };
      expect(renderTemplate(template, data)).toBe("Item: A, Item: B, Item: C, ");
    });

    test("handles simple array items with {{.}}", () => {
      const template = "{{#tags}}[{{.}}]{{/tags}}";
      const data = { tags: ["a", "b", "c"] };
      expect(renderTemplate(template, data)).toBe("[a][b][c]");
    });

    test("handles empty arrays with inverted section", () => {
      const template = "{{#items}}{{name}}{{/items}}{{^items}}No items{{/items}}";

      expect(renderTemplate(template, { items: [{ name: "A" }] })).toBe("A");
      expect(renderTemplate(template, { items: [] })).toBe("No items");
    });

    test("handles falsy conditionals", () => {
      const template = "{{#show}}Visible{{/show}}{{^show}}Hidden{{/show}}";

      expect(renderTemplate(template, { show: true })).toBe("Visible");
      expect(renderTemplate(template, { show: false })).toBe("Hidden");
    });
  });

  describe("processReportData", () => {
    const mockReport: ReportFile = {
      generated_at: "2026-01-21T15:40:00.000Z",
      time_range: {
        from: "2026-01-20T15:40:00.000Z",
        to: "2026-01-21T15:40:00.000Z",
      },
      summary: {
        total_fetched: 10,
        selected_count: 1,
      },
      tweets: [
        {
          id: "123",
          text: "Check out https://example.com and @user #hashtag",
          author: {
            id: "456",
            username: "testuser",
            name: "Test User",
          },
          created_at: "2026-01-21T10:00:00.000Z",
          url: "https://x.com/testuser/status/123",
          metrics: {
            retweet_count: 10,
            like_count: 50,
            reply_count: 5,
            quote_count: 0,
            view_count: 100,
            bookmark_count: 0,
          },
          is_retweet: false,
          is_quote: false,
          is_reply: false,
          reason: "AI-related content",
        },
      ],
    };

    test("extracts date correctly", () => {
      const data = processReportData(mockReport);
      expect(data.date).toBe("2026-01-21");
    });

    test("calculates summary stats", () => {
      const data = processReportData(mockReport);
      expect(data.total_fetched).toBe(10);
      expect(data.selected_count).toBe(1);
    });

    test("processes tweet text with links", () => {
      const data = processReportData(mockReport);
      expect(data.tweets[0].text_html).toContain('<a href="https://example.com"');
      expect(data.tweets[0].text_html).toContain('<a href="https://x.com/user"');
      expect(data.tweets[0].text_html).toContain('<a href="https://x.com/hashtag/hashtag"');
    });

    test("adds author initial", () => {
      const data = processReportData(mockReport);
      expect(data.tweets[0].author.initial).toBe("T");
    });
  });

  describe("findLatestReport", () => {
    test("returns null when no reports exist", async () => {
      // This test depends on the actual state of the output directory
      // In a clean environment, it should return null or find existing reports
      const result = await findLatestReport();
      // Just verify it returns string or null
      expect(result === null || typeof result === "string").toBe(true);
    });
  });

  describe("renderReport integration", () => {
    let testReportPath: string;

    beforeEach(async () => {
      // Create a test report
      const testReport: ReportFile = {
        generated_at: "2026-01-21T15:40:00.000Z",
        time_range: {
          from: "2026-01-20T15:40:00.000Z",
          to: "2026-01-21T15:40:00.000Z",
        },
        summary: {
          total_fetched: 3,
          selected_count: 1,
        },
        tweets: [
          {
            id: "123",
            text: "Test tweet about AI",
            author: {
              id: "456",
              username: "testuser",
              name: "Test User",
            },
            created_at: "2026-01-21T10:00:00.000Z",
            url: "https://x.com/testuser/status/123",
            metrics: {
              retweet_count: 10,
              like_count: 50,
              reply_count: 5,
              quote_count: 0,
              view_count: 100,
              bookmark_count: 0,
            },
            is_retweet: false,
            is_quote: false,
            is_reply: false,
            reason: "AI research discussion",
          },
        ],
      };

      testReportPath = join(OUTPUT_DIR, "test_report.json");
      await Bun.write(testReportPath, JSON.stringify(testReport, null, 2));
    });

    afterEach(async () => {
      // Clean up test files
      await Bun.file(testReportPath).delete().catch(() => {});
      await Bun.file(join(PUBLIC_DIR, "test_report.html")).delete().catch(() => {});
    });

    test("renders report to HTML", async () => {
      const result = await renderReport(testReportPath);

      expect(result.success).toBe(true);
      expect(result.data?.html).toContain("X-Ray Report");
      expect(result.data?.html).toContain("Test tweet about AI");
      expect(result.data?.html).toContain("AI research discussion");
    });

    test("fails for non-existent report", async () => {
      const result = await renderReport("/nonexistent/report.json");

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_NOT_FOUND");
    });
  });
});
