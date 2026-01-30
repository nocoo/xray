import { describe, test, expect } from "bun:test";
import { buildSearchOutput } from "../agent/research/search-trump-fed-gold";

describe("search-trump-fed-gold", () => {
  test("buildSearchOutput summarizes totals", async () => {
    const output = buildSearchOutput({
      queries: ["a"],
      results: [
        { term: "a", tweets: [] },
      ],
    });

    expect(output.summary.total).toBe(0);
    expect(output.query.terms).toEqual(["a"]);
  });
});
