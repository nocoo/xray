import { describe, test, expect } from "bun:test";
import { parseTwitterExportFile } from "../lib/twitter-export";

describe("parseTwitterExportFile", () => {
  test("parses standard Twitter export format", () => {
    const content = `window.YTD.following.part0 = [
  { "following": { "accountId": "123", "userLink": "https://twitter.com/intent/user?user_id=123" } },
  { "following": { "accountId": "456", "userLink": "https://twitter.com/intent/user?user_id=456" } }
]`;
    const result = parseTwitterExportFile(content);
    expect(result).toEqual(["123", "456"]);
  });

  test("handles part1, part2, etc. naming", () => {
    const content = `window.YTD.following.part3 = [
  { "following": { "accountId": "999" } }
]`;
    expect(parseTwitterExportFile(content)).toEqual(["999"]);
  });

  test("returns null for empty array", () => {
    const content = `window.YTD.following.part0 = []`;
    expect(parseTwitterExportFile(content)).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    const content = `window.YTD.following.part0 = [not valid json`;
    expect(parseTwitterExportFile(content)).toBeNull();
  });

  test("returns null for no array in content", () => {
    const content = `just some random text without brackets`;
    expect(parseTwitterExportFile(content)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseTwitterExportFile("")).toBeNull();
  });

  test("returns null for wrong shape (missing following.accountId)", () => {
    const content = `window.YTD.following.part0 = [
  { "something": { "else": "value" } }
]`;
    expect(parseTwitterExportFile(content)).toBeNull();
  });

  test("filters out entries with missing accountId", () => {
    const content = `window.YTD.following.part0 = [
  { "following": { "accountId": "111" } },
  { "following": {} },
  { "following": { "accountId": "333" } }
]`;
    const result = parseTwitterExportFile(content);
    expect(result).toEqual(["111", "333"]);
  });

  test("handles large export files", () => {
    const entries = Array.from(
      { length: 1000 },
      (_, i) =>
        `{ "following": { "accountId": "${i + 1}" } }`,
    );
    const content = `window.YTD.following.part0 = [\n${entries.join(",\n")}\n]`;
    const result = parseTwitterExportFile(content);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1000);
    expect(result![0]).toBe("1");
    expect(result![999]).toBe("1000");
  });

  test("works with raw JSON array (no window.YTD prefix)", () => {
    // Edge case: user might strip the prefix themselves
    const content = `[{ "following": { "accountId": "42" } }]`;
    expect(parseTwitterExportFile(content)).toEqual(["42"]);
  });

  test("handles extra whitespace around the assignment", () => {
    const content = `  window.YTD.following.part0  =  [
  { "following": { "accountId": "789" } }
]  `;
    expect(parseTwitterExportFile(content)).toEqual(["789"]);
  });

  // --- JS object literal format (unquoted keys + trailing commas) ---

  test("parses unquoted keys with trailing commas (following)", () => {
    const content = `window.YTD.following.part0 = [
  {
    following: {
      accountId: "20567308",
      userLink: "https://twitter.com/intent/user?user_id=20567308",
    },
  },
  {
    following: {
      accountId: "242607677",
      userLink: "https://twitter.com/intent/user?user_id=242607677",
    },
  },
];`;
    const result = parseTwitterExportFile(content);
    expect(result).toEqual(["20567308", "242607677"]);
  });

  test("parses unquoted keys with trailing commas (follower)", () => {
    const content = `window.YTD.follower.part0 = [
  {
    follower: {
      accountId: "111222",
      userLink: "https://twitter.com/intent/user?user_id=111222",
    },
  },
];`;
    const result = parseTwitterExportFile(content);
    expect(result).toEqual(["111222"]);
  });

  test("handles mixed: some entries with trailing commas, some without", () => {
    const content = `window.YTD.following.part0 = [
  {
    following: {
      accountId: "100",
      userLink: "https://twitter.com/intent/user?user_id=100"
    }
  },
  {
    following: {
      accountId: "200",
      userLink: "https://twitter.com/intent/user?user_id=200",
    },
  }
]`;
    const result = parseTwitterExportFile(content);
    expect(result).toEqual(["100", "200"]);
  });

  test("handles large unquoted-key export", () => {
    const entries = Array.from(
      { length: 500 },
      (_, i) =>
        `  {\n    following: {\n      accountId: "${i + 1}",\n    },\n  }`,
    );
    const content = `window.YTD.following.part0 = [\n${entries.join(",\n")}\n]`;
    const result = parseTwitterExportFile(content);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(500);
    expect(result![0]).toBe("1");
    expect(result![499]).toBe("500");
  });
});
