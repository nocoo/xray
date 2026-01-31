import { describe, test, expect } from "bun:test";
import { buildNeverUsersOutput } from "../agent/research/check-never-users";

describe("check-never-users", () => {
  test("buildNeverUsersOutput summarizes totals", async () => {
    const output = buildNeverUsersOutput({
      users: ["a"],
      results: [{ username: "a", tweets: [] }],
    });

    expect(output.summary.total).toBe(0);
    expect(output.query.users).toEqual(["a"]);
  });
});
