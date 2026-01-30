import { describe, test, expect } from "bun:test";
import { buildSearchOutput } from "../agent/research/search-microsoft";

describe("search-microsoft", () => {
  test("buildSearchOutput summarizes totals", async () => {
    const output = buildSearchOutput({
      queries: ["msft"],
      results: [{ term: "msft", tweets: [] }],
    });

    expect(output.summary.total).toBe(0);
    expect(output.query.terms).toEqual(["msft"]);
  });
});
