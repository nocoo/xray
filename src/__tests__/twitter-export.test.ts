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
});
