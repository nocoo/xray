#!/usr/bin/env bun
/**
 * Run pre-push checks in parallel:
 *   - build       (vinext build)
 *   - test        (L1 unit suite via vitest)
 *   - lint        (G1 eslint)
 *   - osv-scanner (G2b dependency vulnerability scan)
 *   - test:e2e:api (L2 API E2E — longest; streams live)
 *
 * Each task is independent. Non-live tasks have their stdout/stderr buffered
 * and replayed in summary order on completion; the L2 task streams live
 * because it dwarfs everything else and includes server lifecycle logs.
 */

import { spawn, type Subprocess } from "bun";

interface Step {
  name: string;
  cmd: string[];
  /** When true, inherit stdio so output streams live. */
  live?: boolean;
}

const STEPS: Step[] = [
  { name: "build", cmd: ["bun", "run", "build"] },
  { name: "test (L1)", cmd: ["bun", "run", "test"] },
  { name: "lint (G1)", cmd: ["bun", "run", "lint"] },
  {
    name: "osv-scanner (G2)",
    cmd: [
      "osv-scanner",
      "scan",
      "--lockfile=bun.lock",
      "--config=osv-scanner.toml",
    ],
  },
  {
    name: "test:e2e:api (L2)",
    cmd: ["bun", "run", "test:e2e:api"],
    live: true,
  },
];

interface Outcome {
  name: string;
  ok: boolean;
  ms: number;
  output?: string;
}

async function run(step: Step): Promise<Outcome> {
  const start = performance.now();
  const proc: Subprocess = spawn(step.cmd, {
    stdout: step.live ? "inherit" : "pipe",
    stderr: step.live ? "inherit" : "pipe",
  });
  let output = "";
  if (!step.live) {
    const [out, err] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
    output = (out + err).trim();
  }
  const code = await proc.exited;
  return { name: step.name, ok: code === 0, ms: performance.now() - start, output };
}

const results = await Promise.all(STEPS.map(run));

let failed = false;
console.log("\n──────── pre-push summary ────────");
for (const r of results) {
  const status = r.ok ? "✅" : "❌";
  console.log(`${status} ${r.name} (${Math.round(r.ms)}ms)`);
  if (!r.ok && r.output) {
    console.log(r.output);
    failed = true;
  } else if (!r.ok) {
    failed = true;
  }
}

if (failed) process.exit(1);
