import { describe, expect, test } from "vitest";
import { parseTweetClawExport } from "../scripts/lib/tweetclaw-import";

const FETCHED_AT = "2026-06-18T06:30:00.000Z";

describe("tweetclaw-import", () => {
  test("converts wrapped TweetClaw JSON records", () => {
    const result = parseTweetClawExport(JSON.stringify({
      tweets: [
        {
          id: "1900000000000000001",
          text: "X-Ray can now import local TweetClaw exports.",
          created: "2026-06-18T06:00:00.000Z",
          username: "xray",
          name: "X-Ray",
          retweet_count: 2,
          reply_count: 3,
          like_count: 11,
          quote_count: 1,
          view_count: 900,
          bookmark_count: 4,
          is_quote_status: true,
          lang: "en",
        },
      ],
    }), FETCHED_AT);

    expect(result.fetched_at).toBe(FETCHED_AT);
    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]).toMatchObject({
      id: "1900000000000000001",
      text: "X-Ray can now import local TweetClaw exports.",
      author: {
        username: "xray",
        name: "X-Ray",
      },
      created_at: "2026-06-18T06:00:00.000Z",
      url: "https://x.com/xray/status/1900000000000000001",
      is_quote: true,
      lang: "en",
      metrics: {
        retweet_count: 2,
        reply_count: 3,
        like_count: 11,
        quote_count: 1,
        view_count: 900,
        bookmark_count: 4,
      },
    });
  });

  test("converts TweetClaw JSONL with nested author and metrics", () => {
    const lines = [
      JSON.stringify({
        tweetId: "1900000000000000002",
        fullText: "Nested JSONL export works too.",
        createdAt: "2026-06-18T06:05:00.000Z",
        author: {
          id: "user-1",
          username: "@builder",
          displayName: "Builder",
          followers: 1200,
          verified: "true",
        },
        metrics: {
          retweets: "5",
          likes: "25",
          replies: "2",
          quotes: "1",
          views: "1,500",
          bookmarks: "7",
        },
        entities: {
          hashtags: ["agents"],
          urls: [{ expanded_url: "https://example.com/post" }],
        },
      }),
      JSON.stringify({ id: "skip-me" }),
    ].join("\n");

    const result = parseTweetClawExport(lines, FETCHED_AT);

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]).toMatchObject({
      id: "1900000000000000002",
      author: {
        id: "user-1",
        username: "builder",
        name: "Builder",
        followers_count: 1200,
        is_verified: true,
      },
      metrics: {
        retweet_count: 5,
        like_count: 25,
        reply_count: 2,
        quote_count: 1,
        view_count: 1500,
        bookmark_count: 7,
      },
      entities: {
        hashtags: ["agents"],
        urls: ["https://example.com/post"],
      },
    });
  });

  test("converts TweetClaw CSV rows", () => {
    const csv = [
      "tweet_id,text,author_username,created_at,like_count,retweet_count,reply_count,url",
      "1900000000000000003,\"CSV, with punctuation\",analyst,2026-06-18T06:10:00.000Z,8,2,1,https://x.com/analyst/status/1900000000000000003",
    ].join("\n");

    const result = parseTweetClawExport(csv, FETCHED_AT);

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]).toMatchObject({
      id: "1900000000000000003",
      text: "CSV, with punctuation",
      author: {
        username: "analyst",
      },
      metrics: {
        like_count: 8,
        retweet_count: 2,
        reply_count: 1,
      },
      url: "https://x.com/analyst/status/1900000000000000003",
    });
  });

  test("converts quoted tweets and media variants", () => {
    const result = parseTweetClawExport(JSON.stringify([{
      statusId: "1900000000000000004",
      body: "Quote with media.",
      date: "not-a-date",
      handle: "",
      type: "quote",
      media: [
        { id: "m1", type: "video", url: "https://example.com/video.mp4", thumbnail_url: "https://example.com/thumb.jpg" },
        { id: "m2", type: "gif", url: "https://example.com/clip.gif" },
        { id: "m3", type: "image", media_url: "https://example.com/photo.jpg" },
        { id: "m4", type: "video" },
        "bad-media",
      ],
      quoted_tweet: {
        id: "1900000000000000005",
        text: "Quoted root.",
        username: "quoted",
      },
    }]), FETCHED_AT);

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]).toMatchObject({
      id: "1900000000000000004",
      author: {
        username: "unknown",
      },
      created_at: "not-a-date",
      is_quote: true,
      media: [
        { id: "m1", type: "VIDEO", url: "https://example.com/video.mp4" },
        { id: "m2", type: "GIF", url: "https://example.com/clip.gif" },
        { id: "m3", type: "PHOTO", url: "https://example.com/photo.jpg" },
      ],
      quoted_tweet: {
        id: "1900000000000000005",
        author: {
          username: "quoted",
        },
      },
    });
  });

  test("handles fallback inputs without importing invalid tweets", () => {
    expect(parseTweetClawExport("", FETCHED_AT).tweets).toEqual([]);
    expect(parseTweetClawExport("not json\nalso not json", FETCHED_AT).tweets).toEqual([]);
    expect(parseTweetClawExport("42", FETCHED_AT).tweets).toEqual([]);
    expect(parseTweetClawExport(JSON.stringify({ data: [42, null, { id: "missing-text" }] }), FETCHED_AT).tweets).toEqual([]);
  });

  test("parses CSV escaped quotes and CRLF rows", () => {
    const csv = [
      "id,text,screen_name,is_retweet",
      "1900000000000000006,\"He said \"\"ship it\"\"\",dev,true",
    ].join("\r\n");

    const result = parseTweetClawExport(csv, FETCHED_AT);

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]).toMatchObject({
      id: "1900000000000000006",
      text: "He said \"ship it\"",
      author: {
        username: "dev",
      },
      is_retweet: true,
    });
  });
});
