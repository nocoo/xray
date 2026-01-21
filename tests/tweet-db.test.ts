import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import type { Tweet } from "../scripts/lib/types";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import {
  tweetInsert,
  tweetInsertMany,
  tweetGet,
  tweetGetRecent,
  tweetGetByIds,
  tweetToModel,
  tweetCount,
  processedMark,
  processedMarkMany,
  processedGet,
  processedGetAll,
  processedGetAllIds,
  processedCount,
  classificationUpsert,
  classificationGet,
  classificationGetByIds,
  classificationToModel,
  classificationGetTechRelated,
  classificationGetHotTopics,
} from "../scripts/lib/tweet-db";

const createMockTweet = (id: string): Tweet => ({
  id,
  text: `Test tweet ${id}`,
  author: {
    id: `author_${id}`,
    username: "testuser",
    name: "Test User",
  },
  created_at: "2026-01-21T10:00:00.000Z",
  url: `https://x.com/testuser/status/${id}`,
  metrics: {
    retweet_count: id.length % 10,
    like_count: id.length % 100,
    reply_count: id.length % 5,
  },
  is_retweet: false,
  is_quote: false,
});

describe("tweet-db", () => {
  beforeAll(() => {
    useTestDB();
    resetDB();
  });

  afterAll(() => {
    resetDB();
    useRealDB();
  });

  beforeEach(() => {
    resetDB();
  });

  describe("tweetInsert & tweetGet", () => {
    test("inserts and retrieves a tweet", () => {
      const tweet = createMockTweet("t1");
      tweetInsert(tweet);

      const result = tweetGet("t1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("t1");
      expect(result!.text).toBe("Test tweet t1");
      expect(result!.author_username).toBe("testuser");
    });

    test("returns null for non-existent tweet", () => {
      const result = tweetGet("nonexistent");
      expect(result).toBeNull();
    });

    test("updates existing tweet (INSERT OR REPLACE)", () => {
      const tweet = createMockTweet("t2");
      tweetInsert(tweet);

      const updatedTweet = { ...tweet, text: "Updated tweet" };
      tweetInsert(updatedTweet);

      const result = tweetGet("t2");
      expect(result!.text).toBe("Updated tweet");
      expect(tweetCount()).toBe(1);
    });
  });

  describe("tweetInsertMany", () => {
    test("inserts multiple tweets", () => {
      const tweets = [
        createMockTweet("m1"),
        createMockTweet("m2"),
        createMockTweet("m3"),
      ];
      tweetInsertMany(tweets);

      expect(tweetCount()).toBe(3);
      expect(tweetGet("m1")).not.toBeNull();
      expect(tweetGet("m2")).not.toBeNull();
      expect(tweetGet("m3")).not.toBeNull();
    });

    test("handles empty array", () => {
      tweetInsertMany([]);
      expect(tweetCount()).toBe(0);
    });

    test("inserts unique tweets only", () => {
      const tweets = [
        createMockTweet("u1"),
        createMockTweet("u2"),
        createMockTweet("u1"),
      ];
      tweetInsertMany(tweets);

      expect(tweetCount()).toBe(2);
    });
  });

  describe("tweetGetRecent", () => {
    test("returns recent tweets in descending order", () => {
      tweetInsertMany([
        createMockTweet("r1"),
        createMockTweet("r2"),
        createMockTweet("r3"),
      ]);

      const recent = tweetGetRecent(2);
      expect(recent).toHaveLength(2);
    });

    test("respects limit parameter", () => {
      tweetInsertMany([
        createMockTweet("r4"),
        createMockTweet("r5"),
        createMockTweet("r6"),
      ]);

      const recent = tweetGetRecent(2);
      expect(recent).toHaveLength(2);
    });
  });

  describe("tweetGetByIds", () => {
    test("retrieves tweets by IDs", () => {
      tweetInsertMany([
        createMockTweet("b1"),
        createMockTweet("b2"),
        createMockTweet("b3"),
      ]);

      const result = tweetGetByIds(["b1", "b3"]);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id).sort()).toEqual(["b1", "b3"]);
    });

    test("returns empty array for empty input", () => {
      const result = tweetGetByIds([]);
      expect(result).toEqual([]);
    });

    test("returns empty array for non-existent IDs", () => {
      tweetInsert(createMockTweet("b4"));
      const result = tweetGetByIds(["b4", "nonexistent"]);
      expect(result).toHaveLength(1);
    });
  });

  describe("tweetToModel", () => {
    test("converts database row to Tweet object", () => {
      const tweet = createMockTweet("model");
      tweetInsert(tweet);

      const row = tweetGet("model")!;
      const model = tweetToModel(row);

      expect(model.id).toBe("model");
      expect(model.text).toBe("Test tweet model");
      expect(model.author.username).toBe("testuser");
    });
  });

  describe("processedMark & processedGet", () => {
    test("marks a tweet as processed", () => {
      processedMark("proc1", "tech");

      const result = processedGet("proc1");
      expect(result).not.toBeNull();
      expect(result!.tweet_id).toBe("proc1");
      expect(result!.classification_result).toBe("tech");
    });

    test("returns null for non-existent processed tweet", () => {
      const result = processedGet("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("processedMarkMany", () => {
    test("marks multiple tweets as processed", () => {
      processedMarkMany(["pm1", "pm2", "pm3"], "non_tech");

      const all = processedGetAll();
      expect(all).toHaveLength(3);
    });
  });

  describe("processedGetAllIds", () => {
    test("returns all processed tweet IDs", () => {
      processedMark("ids1", "tech");
      processedMark("ids2", "non_tech");
      processedMark("ids3", "skipped");

      const ids = processedGetAllIds();
      expect(ids).toHaveLength(3);
      expect(ids.sort()).toEqual(["ids1", "ids2", "ids3"]);
    });

    test("returns empty array when no tweets processed", () => {
      const ids = processedGetAllIds();
      expect(ids).toEqual([]);
    });
  });

  describe("processedCount", () => {
    test("returns correct count", () => {
      expect(processedCount()).toBe(0);
      processedMark("pc1", "tech");
      expect(processedCount()).toBe(1);
      processedMark("pc2", "tech");
      expect(processedCount()).toBe(2);
    });
  });

  describe("classificationUpsert & classificationGet", () => {
    test("upserts classification for a tweet", () => {
      tweetInsert(createMockTweet("cls1"));
      classificationUpsert("cls1", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["AI/LLM", "Agent"],
        relevance_score: 95,
        reason: "AI Agent discussion",
      });

      const result = classificationGet("cls1");
      expect(result).not.toBeNull();
      expect(result!.is_tech_related).toBe(1);
      expect(result!.is_hot_topic).toBe(1);
      expect(result!.relevance_score).toBe(95);
    });

    test("returns null for non-existent classification", () => {
      const result = classificationGet("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("classificationGetByIds", () => {
    test("retrieves classifications by tweet IDs", () => {
      tweetInsert(createMockTweet("cbi1"));
      tweetInsert(createMockTweet("cbi2"));
      tweetInsert(createMockTweet("cbi3"));

      classificationUpsert("cbi1", {
        is_tech_related: true,
        is_hot_topic: false,
        category: ["AI/LLM"],
        relevance_score: 80,
        reason: "AI content",
      });
      classificationUpsert("cbi2", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["Agent"],
        relevance_score: 90,
        reason: "Hot agent topic",
      });

      const result = classificationGetByIds(["cbi1", "cbi3"]);
      expect(result).toHaveLength(1);
    });

    test("returns empty array for empty input", () => {
      const result = classificationGetByIds([]);
      expect(result).toEqual([]);
    });
  });

  describe("classificationToModel", () => {
    test("converts database row to classification model", () => {
      tweetInsert(createMockTweet("ctm1"));
      classificationUpsert("ctm1", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["Research", "AI/LLM"],
        relevance_score: 88,
        reason: "Research paper about AI",
      });

      const row = classificationGet("ctm1")!;
      const model = classificationToModel(row);

      expect(model.is_tech_related).toBe(true);
      expect(model.is_hot_topic).toBe(true);
      expect(model.category).toEqual(["Research", "AI/LLM"]);
      expect(model.relevance_score).toBe(88);
    });
  });

  describe("classificationGetTechRelated", () => {
    test("returns only tech-related tweets", () => {
      const tweets = ["cttr1", "cttr2", "cttr3"].map((id) => ({
        ...createMockTweet(id),
        created_at: id.includes("1") || id.includes("2")
          ? "2026-01-21T12:00:00.000Z"
          : "2026-01-21T10:00:00.000Z",
      }));
      tweetInsertMany(tweets);

      classificationUpsert("cttr1", {
        is_tech_related: true,
        is_hot_topic: false,
        category: ["AI/LLM"],
        relevance_score: 70,
        reason: "AI content",
      });
      classificationUpsert("cttr2", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["Agent"],
        relevance_score: 85,
        reason: "Agent topic",
      });
      classificationUpsert("cttr3", {
        is_tech_related: false,
        is_hot_topic: false,
        category: ["Other"],
        relevance_score: 10,
        reason: "Not tech",
      });

      const result = classificationGetTechRelated(10);
      expect(result).toHaveLength(2);
      const ids = result.map((t) => t.id).sort();
      expect(ids).toEqual(["cttr1", "cttr2"]);
    });

    test("respects limit parameter", () => {
      tweetInsertMany([
        { ...createMockTweet("l1"), created_at: "2026-01-21T12:00:00.000Z" },
        { ...createMockTweet("l2"), created_at: "2026-01-21T12:00:00.000Z" },
        { ...createMockTweet("l3"), created_at: "2026-01-21T12:00:00.000Z" },
      ]);
      classificationUpsert("l1", { is_tech_related: true, is_hot_topic: false, category: ["AI"], relevance_score: 80, reason: "AI" });
      classificationUpsert("l2", { is_tech_related: true, is_hot_topic: false, category: ["AI"], relevance_score: 70, reason: "AI" });
      classificationUpsert("l3", { is_tech_related: true, is_hot_topic: false, category: ["AI"], relevance_score: 60, reason: "AI" });

      const result = classificationGetTechRelated(2);
      expect(result).toHaveLength(2);
    });
  });

  describe("classificationGetHotTopics", () => {
    test("returns only hot topic tweets sorted by score", () => {
      const tweets = ["cht1", "cht2", "cht3", "cht4"].map((id) => ({
        ...createMockTweet(id),
        created_at: "2026-01-21T12:00:00.000Z",
      }));
      tweetInsertMany(tweets);

      classificationUpsert("cht1", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["AI/LLM"],
        relevance_score: 95,
        reason: "Very hot topic",
      });
      classificationUpsert("cht2", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["Agent"],
        relevance_score: 80,
        reason: "Hot agent news",
      });
      classificationUpsert("cht3", {
        is_tech_related: true,
        is_hot_topic: false,
        category: ["Other"],
        relevance_score: 50,
        reason: "Not hot",
      });
      classificationUpsert("cht4", {
        is_tech_related: true,
        is_hot_topic: true,
        category: ["Research"],
        relevance_score: 70,
        reason: "Research hot topic",
      });

      const result = classificationGetHotTopics(10);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("cht1");
      expect(result[1].id).toBe("cht2");
      expect(result[2].id).toBe("cht4");
    });

    test("respects limit parameter", () => {
      tweetInsertMany([
        { ...createMockTweet("hl1"), created_at: "2026-01-21T12:00:00.000Z" },
        { ...createMockTweet("hl2"), created_at: "2026-01-21T12:00:00.000Z" },
      ]);
      classificationUpsert("hl1", { is_tech_related: true, is_hot_topic: true, category: ["AI"], relevance_score: 90, reason: "Hot" });
      classificationUpsert("hl2", { is_tech_related: true, is_hot_topic: true, category: ["AI"], relevance_score: 80, reason: "Hot" });

      const result = classificationGetHotTopics(1);
      expect(result).toHaveLength(1);
    });
  });
});
