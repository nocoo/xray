import { describe, test, expect } from "bun:test";
import {
  getTweetType,
  isPureLink,
  getTextContent,
  getTextContentLength,
  getMediaTypes,
  extractTweetSummary,
  filterTweets,
  calculateStats,
  extractAllSummaries,
  type TweetSummary,
  type FilterOptions,
} from "../scripts/lib/tweet-utils";
import type { Tweet, TweetMetrics, TweetAuthor } from "../scripts/lib/types";

function createMockAuthor(overrides: Partial<TweetAuthor> = {}): TweetAuthor {
  return {
    id: "123456",
    username: "testuser",
    name: "Test User",
    profile_image_url: "https://example.com/avatar.jpg",
    followers_count: 1000,
    is_verified: false,
    ...overrides,
  };
}

function createMockMetrics(overrides: Partial<TweetMetrics> = {}): TweetMetrics {
  return {
    retweet_count: 10,
    like_count: 50,
    reply_count: 5,
    quote_count: 2,
    view_count: 1000,
    bookmark_count: 3,
    ...overrides,
  };
}

function createMockTweet(overrides: Partial<Tweet> = {}): Tweet {
  return {
    id: "tweet123",
    text: "This is a test tweet with some content",
    author: createMockAuthor(),
    created_at: "2026-01-20T10:00:00.000Z",
    url: "https://x.com/testuser/status/tweet123",
    metrics: createMockMetrics(),
    is_retweet: false,
    is_quote: false,
    is_reply: false,
    ...overrides,
  };
}

describe("tweet-utils", () => {
  describe("getTweetType", () => {
    test("returns 'original' for regular tweet", () => {
      const tweet = createMockTweet();
      expect(getTweetType(tweet)).toBe("original");
    });

    test("returns 'retweet' for retweet", () => {
      const tweet = createMockTweet({ is_retweet: true });
      expect(getTweetType(tweet)).toBe("retweet");
    });

    test("returns 'reply' for reply", () => {
      const tweet = createMockTweet({ is_reply: true });
      expect(getTweetType(tweet)).toBe("reply");
    });

    test("returns 'quote' for quote tweet", () => {
      const tweet = createMockTweet({ is_quote: true });
      expect(getTweetType(tweet)).toBe("quote");
    });

    test("prioritizes retweet over other flags", () => {
      const tweet = createMockTweet({ is_retweet: true, is_reply: true, is_quote: true });
      expect(getTweetType(tweet)).toBe("retweet");
    });

    test("prioritizes reply over quote", () => {
      const tweet = createMockTweet({ is_reply: true, is_quote: true });
      expect(getTweetType(tweet)).toBe("reply");
    });
  });

  describe("isPureLink", () => {
    test("returns true for single URL", () => {
      expect(isPureLink("https://example.com")).toBe(true);
    });

    test("returns true for multiple URLs only", () => {
      expect(isPureLink("https://a.com https://b.com")).toBe(true);
    });

    test("returns true for empty string", () => {
      expect(isPureLink("")).toBe(true);
    });

    test("returns true for whitespace only", () => {
      expect(isPureLink("   ")).toBe(true);
    });

    test("returns false for text with URL", () => {
      expect(isPureLink("Check this out https://example.com")).toBe(false);
    });

    test("returns false for pure text", () => {
      expect(isPureLink("Just some text here")).toBe(false);
    });

    test("returns true for URL with trailing spaces", () => {
      expect(isPureLink("https://example.com   ")).toBe(true);
    });

    test("returns true for URL with leading spaces", () => {
      expect(isPureLink("   https://example.com")).toBe(true);
    });
  });

  describe("getTextContent", () => {
    test("removes single URL from text", () => {
      expect(getTextContent("Hello https://example.com")).toBe("Hello");
    });

    test("removes multiple URLs from text", () => {
      expect(getTextContent("Hello https://a.com world https://b.com")).toBe("Hello  world");
    });

    test("returns original text if no URLs", () => {
      expect(getTextContent("Hello world")).toBe("Hello world");
    });

    test("returns empty string for pure link", () => {
      expect(getTextContent("https://example.com")).toBe("");
    });

    test("trims result", () => {
      expect(getTextContent("   Hello https://x.com   ")).toBe("Hello");
    });
  });

  describe("getTextContentLength", () => {
    test("returns length of text without URLs", () => {
      expect(getTextContentLength("Hello https://example.com")).toBe(5);
    });

    test("returns 0 for pure link", () => {
      expect(getTextContentLength("https://example.com")).toBe(0);
    });

    test("returns correct length for text without URLs", () => {
      expect(getTextContentLength("Hello world")).toBe(11);
    });
  });

  describe("getMediaTypes", () => {
    test("returns empty array for no media", () => {
      const tweet = createMockTweet({ media: undefined });
      expect(getMediaTypes(tweet)).toEqual([]);
    });

    test("returns empty array for empty media array", () => {
      const tweet = createMockTweet({ media: [] });
      expect(getMediaTypes(tweet)).toEqual([]);
    });

    test("returns unique media types", () => {
      const tweet = createMockTweet({
        media: [
          { id: "1", type: "PHOTO", url: "https://a.jpg" },
          { id: "2", type: "PHOTO", url: "https://b.jpg" },
          { id: "3", type: "VIDEO", url: "https://v.mp4" },
        ],
      });
      expect(getMediaTypes(tweet)).toEqual(["PHOTO", "VIDEO"]);
    });

    test("returns single type for single media", () => {
      const tweet = createMockTweet({
        media: [{ id: "1", type: "GIF", url: "https://g.gif" }],
      });
      expect(getMediaTypes(tweet)).toEqual(["GIF"]);
    });
  });

  describe("extractTweetSummary", () => {
    test("extracts basic tweet summary", () => {
      const tweet = createMockTweet();
      const summary = extractTweetSummary(tweet);

      expect(summary.id).toBe("tweet123");
      expect(summary.url).toBe("https://x.com/testuser/status/tweet123");
      expect(summary.author.username).toBe("testuser");
      expect(summary.author.name).toBe("Test User");
      expect(summary.author.followers_count).toBe(1000);
      expect(summary.author.is_verified).toBe(false);
      expect(summary.type).toBe("original");
      expect(summary.has_media).toBe(false);
      expect(summary.media_types).toEqual([]);
    });

    test("extracts text length without URLs", () => {
      const tweet = createMockTweet({ text: "Hello world https://example.com" });
      const summary = extractTweetSummary(tweet);

      expect(summary.text).toBe("Hello world https://example.com");
      expect(summary.text_length).toBe(11); // "Hello world" without URL
    });

    test("extracts metrics correctly", () => {
      const tweet = createMockTweet({
        metrics: createMockMetrics({
          view_count: 5000,
          like_count: 100,
          retweet_count: 20,
        }),
      });
      const summary = extractTweetSummary(tweet);

      expect(summary.metrics.views).toBe(5000);
      expect(summary.metrics.likes).toBe(100);
      expect(summary.metrics.retweets).toBe(20);
    });

    test("extracts media info", () => {
      const tweet = createMockTweet({
        media: [
          { id: "1", type: "PHOTO", url: "https://a.jpg" },
          { id: "2", type: "VIDEO", url: "https://v.mp4" },
        ],
      });
      const summary = extractTweetSummary(tweet);

      expect(summary.has_media).toBe(true);
      expect(summary.media_types).toEqual(["PHOTO", "VIDEO"]);
    });

    test("extracts URL info from entities", () => {
      const tweet = createMockTweet({
        entities: {
          hashtags: [],
          mentioned_users: [],
          urls: ["https://a.com", "https://b.com"],
        },
      });
      const summary = extractTweetSummary(tweet);

      expect(summary.has_urls).toBe(true);
      expect(summary.url_count).toBe(2);
    });

    test("extracts quoted tweet info", () => {
      const quotedTweet = createMockTweet({
        id: "quoted123",
        text: "Original quoted content",
        author: createMockAuthor({ username: "quoteduser", name: "Quoted User" }),
        media: [{ id: "1", type: "VIDEO", url: "https://v.mp4" }],
      });

      const tweet = createMockTweet({
        is_quote: true,
        quoted_tweet: quotedTweet,
      });

      const summary = extractTweetSummary(tweet);

      expect(summary.type).toBe("quote");
      expect(summary.quoted_tweet).toBeDefined();
      expect(summary.quoted_tweet!.id).toBe("quoted123");
      expect(summary.quoted_tweet!.author_username).toBe("quoteduser");
      expect(summary.quoted_tweet!.author_name).toBe("Quoted User");
      expect(summary.quoted_tweet!.text).toBe("Original quoted content");
      expect(summary.quoted_tweet!.has_media).toBe(true);
      expect(summary.quoted_tweet!.media_types).toEqual(["VIDEO"]);
    });

    test("handles missing optional fields gracefully", () => {
      const tweet = createMockTweet({
        author: {
          id: "123",
          username: "user",
          name: "User",
        },
        entities: undefined,
      });
      const summary = extractTweetSummary(tweet);

      expect(summary.author.followers_count).toBe(0);
      expect(summary.author.is_verified).toBe(false);
      expect(summary.has_urls).toBe(false);
      expect(summary.url_count).toBe(0);
    });
  });

  describe("filterTweets", () => {
    test("filters out retweets by default", () => {
      const tweets = [
        createMockTweet({ id: "1" }),
        createMockTweet({ id: "2", is_retweet: true }),
      ];

      const result = filterTweets(tweets);

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered.length).toBe(1);
      expect(result.filtered[0].reason).toBe("is_retweet");
    });

    test("filters out replies by default", () => {
      const tweets = [
        createMockTweet({ id: "1" }),
        createMockTweet({ id: "2", is_reply: true }),
      ];

      const result = filterTweets(tweets);

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered[0].reason).toBe("is_reply");
    });

    test("filters out pure links by default", () => {
      const tweets = [
        createMockTweet({ id: "1", text: "Interesting content here" }),
        createMockTweet({ id: "2", text: "https://example.com" }),
      ];

      const result = filterTweets(tweets);

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered[0].reason).toBe("pure_link");
    });

    test("filters short text by default (min 10 chars)", () => {
      const tweets = [
        createMockTweet({ id: "1", text: "This is a long enough text" }),
        createMockTweet({ id: "2", text: "Short" }),
      ];

      const result = filterTweets(tweets);

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered[0].reason).toContain("text_too_short");
    });

    test("respects min_views filter", () => {
      const tweets = [
        createMockTweet({ id: "1", metrics: createMockMetrics({ view_count: 1000 }) }),
        createMockTweet({ id: "2", metrics: createMockMetrics({ view_count: 50 }) }),
      ];

      const result = filterTweets(tweets, { min_views: 100 });

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered[0].reason).toContain("low_views");
    });

    test("respects only_with_media filter", () => {
      const tweets = [
        createMockTweet({
          id: "1",
          media: [{ id: "m1", type: "PHOTO", url: "https://a.jpg" }],
        }),
        createMockTweet({ id: "2" }),
      ];

      const result = filterTweets(tweets, { only_with_media: true });

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered[0].reason).toBe("no_media");
    });

    test("respects only_with_quoted filter", () => {
      const quotedTweet = createMockTweet({ id: "quoted" });
      const tweets = [
        createMockTweet({ id: "1", is_quote: true, quoted_tweet: quotedTweet }),
        createMockTweet({ id: "2" }),
      ];

      const result = filterTweets(tweets, { only_with_quoted: true });

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("1");
      expect(result.filtered[0].reason).toBe("no_quoted_tweet");
    });

    test("allows retweets when exclude_retweets is false", () => {
      const tweets = [createMockTweet({ id: "1", is_retweet: true })];

      const result = filterTweets(tweets, { exclude_retweets: false });

      expect(result.passed.length).toBe(1);
    });

    test("allows replies when exclude_replies is false", () => {
      const tweets = [createMockTweet({ id: "1", is_reply: true })];

      const result = filterTweets(tweets, { exclude_replies: false });

      expect(result.passed.length).toBe(1);
    });

    test("handles empty array", () => {
      const result = filterTweets([]);

      expect(result.passed).toEqual([]);
      expect(result.filtered).toEqual([]);
    });

    test("applies multiple filters in order", () => {
      const tweets = [
        createMockTweet({ id: "1", is_retweet: true }),
        createMockTweet({ id: "2", is_reply: true }),
        createMockTweet({ id: "3", text: "https://pure.link" }),
        createMockTweet({ id: "4", text: "Short" }),
        createMockTweet({ id: "5", text: "This passes all filters!" }),
      ];

      const result = filterTweets(tweets);

      expect(result.passed.length).toBe(1);
      expect(result.passed[0].id).toBe("5");
      expect(result.filtered.length).toBe(4);
    });
  });

  describe("extractAllSummaries", () => {
    test("extracts summaries for all tweets", () => {
      const tweets = [
        createMockTweet({ id: "1" }),
        createMockTweet({ id: "2" }),
        createMockTweet({ id: "3" }),
      ];

      const summaries = extractAllSummaries(tweets);

      expect(summaries.length).toBe(3);
      expect(summaries[0].id).toBe("1");
      expect(summaries[1].id).toBe("2");
      expect(summaries[2].id).toBe("3");
    });

    test("handles empty array", () => {
      const summaries = extractAllSummaries([]);
      expect(summaries).toEqual([]);
    });
  });

  describe("calculateStats", () => {
    test("calculates basic stats", () => {
      const tweets = [
        createMockTweet({ id: "1", text: "Hello world" }),
        createMockTweet({ id: "2", text: "Another tweet here" }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.total).toBe(2);
      expect(stats.by_type.original).toBe(2);
    });

    test("counts tweet types correctly", () => {
      const tweets = [
        createMockTweet({ id: "1" }),
        createMockTweet({ id: "2", is_retweet: true }),
        createMockTweet({ id: "3", is_reply: true }),
        createMockTweet({ id: "4", is_quote: true }),
        createMockTweet({ id: "5", is_quote: true }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.by_type.original).toBe(1);
      expect(stats.by_type.retweet).toBe(1);
      expect(stats.by_type.reply).toBe(1);
      expect(stats.by_type.quote).toBe(2);
    });

    test("counts tweets with media", () => {
      const tweets = [
        createMockTweet({ id: "1", media: [{ id: "m1", type: "PHOTO", url: "a.jpg" }] }),
        createMockTweet({ id: "2" }),
        createMockTweet({ id: "3", media: [{ id: "m2", type: "VIDEO", url: "v.mp4" }] }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.with_media).toBe(2);
    });

    test("counts tweets with quoted content", () => {
      const quotedTweet = createMockTweet({ id: "quoted" });
      const tweets = [
        createMockTweet({ id: "1", quoted_tweet: quotedTweet }),
        createMockTweet({ id: "2" }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.with_quoted).toBe(1);
    });

    test("counts tweets with URLs", () => {
      const tweets = [
        createMockTweet({
          id: "1",
          entities: { hashtags: [], mentioned_users: [], urls: ["https://a.com"] },
        }),
        createMockTweet({ id: "2" }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.with_urls).toBe(1);
    });

    test("calculates average text length", () => {
      const tweets = [
        createMockTweet({ id: "1", text: "Hello" }), // 5 chars
        createMockTweet({ id: "2", text: "World" }), // 5 chars
      ];

      const stats = calculateStats(tweets);

      expect(stats.avg_text_length).toBe(5);
    });

    test("calculates average views", () => {
      const tweets = [
        createMockTweet({ id: "1", metrics: createMockMetrics({ view_count: 1000 }) }),
        createMockTweet({ id: "2", metrics: createMockMetrics({ view_count: 2000 }) }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.avg_views).toBe(1500);
    });

    test("calculates top authors", () => {
      const tweets = [
        createMockTweet({ id: "1", author: createMockAuthor({ username: "alice" }) }),
        createMockTweet({ id: "2", author: createMockAuthor({ username: "bob" }) }),
        createMockTweet({ id: "3", author: createMockAuthor({ username: "alice" }) }),
        createMockTweet({ id: "4", author: createMockAuthor({ username: "alice" }) }),
      ];

      const stats = calculateStats(tweets);

      expect(stats.top_authors[0].username).toBe("alice");
      expect(stats.top_authors[0].count).toBe(3);
      expect(stats.top_authors[1].username).toBe("bob");
      expect(stats.top_authors[1].count).toBe(1);
    });

    test("limits top authors to 10", () => {
      const tweets: Tweet[] = [];
      for (let i = 0; i < 15; i++) {
        tweets.push(
          createMockTweet({
            id: `${i}`,
            author: createMockAuthor({ username: `user${i}` }),
          })
        );
      }

      const stats = calculateStats(tweets);

      expect(stats.top_authors.length).toBe(10);
    });

    test("handles empty array", () => {
      const stats = calculateStats([]);

      expect(stats.total).toBe(0);
      expect(stats.avg_text_length).toBe(0);
      expect(stats.avg_views).toBe(0);
      expect(stats.top_authors).toEqual([]);
    });
  });
});
