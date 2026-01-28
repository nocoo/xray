import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import {
  saveAnalytics,
  getLatestAnalytics,
  getAnalyticsHistory,
  getAnalyticsByDateRange,
  calculateTrend,
  deleteAnalyticsBefore,
  getAnalyticsCount,
} from "../scripts/lib/analytics-db";
import type { Analytics } from "../scripts/lib/types";

beforeAll(() => useTestDB());
afterAll(() => useRealDB());
beforeEach(() => resetDB());

const mockAnalytics: Analytics = {
  impressions: 10000,
  engagements: 500,
  engagement_rate: 5.0,
  likes: 300,
  retweets: 100,
  replies: 50,
  profile_visits: 200,
  followers: 1000,
  following: 100,
};

describe("analytics-db", () => {
  describe("saveAnalytics", () => {
    test("saves analytics record and returns with id", () => {
      const result = saveAnalytics("testuser", mockAnalytics);

      expect(result.id).toBe(1);
      expect(result.username).toBe("testuser");
      expect(result.impressions).toBe(10000);
      expect(result.engagement_rate).toBe(5.0);
      expect(result.fetched_at).toBeDefined();
    });

    test("auto-increments id for multiple saves", () => {
      const first = saveAnalytics("testuser", mockAnalytics);
      const second = saveAnalytics("testuser", mockAnalytics);
      const third = saveAnalytics("testuser", mockAnalytics);

      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
      expect(third.id).toBe(3);
    });
  });

  describe("getLatestAnalytics", () => {
    test("returns null when no records exist", () => {
      const result = getLatestAnalytics("testuser");
      expect(result).toBeNull();
    });

    test("returns latest record for user", () => {
      saveAnalytics("testuser", { ...mockAnalytics, followers: 1000 });
      saveAnalytics("testuser", { ...mockAnalytics, followers: 1100 });
      saveAnalytics("testuser", { ...mockAnalytics, followers: 1200 });

      const result = getLatestAnalytics("testuser");

      expect(result).not.toBeNull();
      expect(result!.followers).toBe(1200);
    });

    test("returns correct user's data when multiple users exist", () => {
      saveAnalytics("user1", { ...mockAnalytics, followers: 1000 });
      saveAnalytics("user2", { ...mockAnalytics, followers: 2000 });

      const result1 = getLatestAnalytics("user1");
      const result2 = getLatestAnalytics("user2");

      expect(result1!.followers).toBe(1000);
      expect(result2!.followers).toBe(2000);
    });
  });

  describe("getAnalyticsHistory", () => {
    test("returns empty array when no records", () => {
      const result = getAnalyticsHistory("testuser");
      expect(result).toEqual([]);
    });

    test("returns records in descending order by fetched_at", () => {
      saveAnalytics("testuser", { ...mockAnalytics, followers: 1000 });
      saveAnalytics("testuser", { ...mockAnalytics, followers: 1100 });
      saveAnalytics("testuser", { ...mockAnalytics, followers: 1200 });

      const result = getAnalyticsHistory("testuser");

      expect(result.length).toBe(3);
      expect(result[0].followers).toBe(1200);
      expect(result[2].followers).toBe(1000);
    });

    test("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        saveAnalytics("testuser", { ...mockAnalytics, followers: 1000 + i });
      }

      const result = getAnalyticsHistory("testuser", 5);

      expect(result.length).toBe(5);
    });
  });

  describe("getAnalyticsByDateRange", () => {
    test("returns records within date range", () => {
      const record = saveAnalytics("testuser", mockAnalytics);

      const from = new Date(Date.now() - 1000 * 60).toISOString();
      const to = new Date(Date.now() + 1000 * 60).toISOString();

      const result = getAnalyticsByDateRange("testuser", from, to);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(record.id);
    });

    test("returns empty array when no records in range", () => {
      saveAnalytics("testuser", mockAnalytics);

      const from = "2020-01-01T00:00:00.000Z";
      const to = "2020-01-02T00:00:00.000Z";

      const result = getAnalyticsByDateRange("testuser", from, to);

      expect(result).toEqual([]);
    });
  });

  describe("calculateTrend", () => {
    test("returns zero changes when no previous record", () => {
      const current = saveAnalytics("testuser", mockAnalytics);
      const trend = calculateTrend(current, null);

      expect(trend.followers.value).toBe(1000);
      expect(trend.followers.change).toBe(0);
      expect(trend.followers.percent).toBe(0);
    });

    test("calculates positive changes correctly", () => {
      const previous = saveAnalytics("testuser", { ...mockAnalytics, followers: 1000 });
      const current = saveAnalytics("testuser", { ...mockAnalytics, followers: 1100 });

      const trend = calculateTrend(current, previous);

      expect(trend.followers.value).toBe(1100);
      expect(trend.followers.change).toBe(100);
      expect(trend.followers.percent).toBe(10);
    });

    test("calculates negative changes correctly", () => {
      const previous = saveAnalytics("testuser", { ...mockAnalytics, followers: 1000 });
      const current = saveAnalytics("testuser", { ...mockAnalytics, followers: 900 });

      const trend = calculateTrend(current, previous);

      expect(trend.followers.value).toBe(900);
      expect(trend.followers.change).toBe(-100);
      expect(trend.followers.percent).toBe(-10);
    });

    test("handles zero previous value", () => {
      const previous = saveAnalytics("testuser", { ...mockAnalytics, likes: 0 });
      const current = saveAnalytics("testuser", { ...mockAnalytics, likes: 100 });

      const trend = calculateTrend(current, previous);

      expect(trend.likes.value).toBe(100);
      expect(trend.likes.change).toBe(100);
      expect(trend.likes.percent).toBe(0);
    });
  });

  describe("deleteAnalyticsBefore", () => {
    test("deletes records before specified date", () => {
      saveAnalytics("testuser", mockAnalytics);

      const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const deleted = deleteAnalyticsBefore(futureDate);

      expect(deleted).toBe(1);
      expect(getAnalyticsCount("testuser")).toBe(0);
    });

    test("does not delete records after specified date", () => {
      saveAnalytics("testuser", mockAnalytics);

      const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
      const deleted = deleteAnalyticsBefore(pastDate);

      expect(deleted).toBe(0);
      expect(getAnalyticsCount("testuser")).toBe(1);
    });
  });

  describe("getAnalyticsCount", () => {
    test("returns 0 when no records", () => {
      expect(getAnalyticsCount("testuser")).toBe(0);
    });

    test("returns correct count", () => {
      saveAnalytics("testuser", mockAnalytics);
      saveAnalytics("testuser", mockAnalytics);
      saveAnalytics("testuser", mockAnalytics);

      expect(getAnalyticsCount("testuser")).toBe(3);
    });

    test("counts only specified user", () => {
      saveAnalytics("user1", mockAnalytics);
      saveAnalytics("user1", mockAnalytics);
      saveAnalytics("user2", mockAnalytics);

      expect(getAnalyticsCount("user1")).toBe(2);
      expect(getAnalyticsCount("user2")).toBe(1);
    });
  });
});
