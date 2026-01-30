import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { writeAgentOutput } from "../agent/lib/agent-output";
import { existsSync, rmSync, mkdirSync } from "fs";
import { dirname } from "path";
import { useTestDB, useRealDB } from "../scripts/lib/db";

describe("agent/lib/agent-output", () => {
  beforeAll(() => {
    useTestDB();
  });

  afterAll(() => {
    useRealDB();
  });

  test("writes output to agent data directory", async () => {
    const payload = { generated_at: "2026-01-30T10:00:00.000Z", items: [] };
    const path = await writeAgentOutput("test", payload);

    expect(existsSync(path)).toBe(true);

    rmSync(path, { force: true });
    const dir = dirname(path);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
