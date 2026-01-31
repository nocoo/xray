import { describe, test, expect } from "bun:test";
import { buildDemoOutput } from "../agent/research/demo";

describe("demo", () => {
  test("buildDemoOutput summarizes totals", async () => {
    const output = buildDemoOutput({
      users: ["a"],
      results: [{ username: "a", tweets: [] }],
    });

    expect(output.summary.total).toBe(0);
    expect(output.query.users).toEqual(["a"]);
  });
});
