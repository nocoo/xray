import { describe, test, expect } from "bun:test";
import { buildSearchOutput } from "../agent/research/search-fed-candidates";

describe("search-fed-candidates", () => {
  test("buildSearchOutput summarizes totals", async () => {
    const output = buildSearchOutput({
      queries: ["fed"],
      results: [{ term: "fed", tweets: [] }],
    });

    expect(output.summary.total).toBe(0);
    expect(output.query.terms).toEqual(["fed"]);
  });
});
