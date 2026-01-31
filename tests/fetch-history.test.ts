import { describe, test, expect } from "bun:test";
import { buildHistoryOutput } from "../agent/research/fetch-history";

describe("fetch-history", () => {
  test("buildHistoryOutput summarizes totals", async () => {
    const output = buildHistoryOutput({
      users: ["a"],
      results: [{ username: "a", tweets: [] }],
      stats: [
        {
          username: "a",
          tweetCount: 0,
          oldestTweet: "2026-01-01",
          newestTweet: "2026-01-01",
          daysActive: 0,
        },
      ],
    });

    expect(output.summary.total).toBe(0);
    expect(output.query.users).toEqual(["a"]);
  });
});
