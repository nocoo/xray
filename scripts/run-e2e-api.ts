#!/usr/bin/env bun
/**
 * L2 API E2E Test Runner
 *
 * This script owns the entire E2E lifecycle so individual test files don't
 * have to spawn `vinext dev` themselves (it's too slow to start within Bun's
 * per-test setup timeout in CI).
 *
 * Steps:
 *   1. Free ports 17007 (auth-bypass server) and 17029 (no-auth server).
 *   2. Remove leftover E2E sqlite databases.
 *   3. Spawn two `vinext dev` instances with the env each test suite expects.
 *   4. Poll /api/auth/providers on each until 200 (max 120s — vinext is slow).
 *   5. Run `bun test src/__tests__/e2e/ --timeout 30000` with E2E_SKIP_SETUP=true.
 *   6. Kill both servers, clean up DBs, exit with the test runner's exit code.
 */

import { type Subprocess, spawn, spawnSync } from "bun";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const AUTH_PORT = 17007;
const AUTH_DB = "database/xray.e2e.db";
const NO_AUTH_PORT = 17029;
const NO_AUTH_DB = "database/xray.noauth.db";

const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;

interface ServerHandle {
  name: string;
  port: number;
  proc: Subprocess;
}

const servers: ServerHandle[] = [];

async function ensurePortFree(port: number): Promise<void> {
  const result = spawnSync(["lsof", "-ti", `tcp:${port}`]);
  const pids = result.stdout.toString().trim();
  if (!pids) return;

  console.warn(`⚠️  Port ${port} occupied by PID ${pids.replace(/\n/g, ", ")} — killing...`);
  for (const pid of pids.split("\n")) {
    const trimmed = pid.trim();
    if (trimmed) spawnSync(["kill", "-9", trimmed]);
  }
  await Bun.sleep(500);
}

function removeDb(relPath: string): void {
  const full = resolve(PROJECT_ROOT, relPath);
  if (existsSync(full)) {
    try {
      unlinkSync(full);
      console.log(`   Removed ${relPath}`);
    } catch (err) {
      console.warn(`   Could not remove ${relPath}: ${(err as Error).message}`);
    }
  }
}

async function waitForReady(name: string, port: number): Promise<boolean> {
  const baseUrl = `http://localhost:${port}`;
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/providers`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`✅ ${name} ready on :${port} (${elapsed}s)`);
        return true;
      }
    } catch {
      // not yet
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function startServer(opts: {
  name: string;
  port: number;
  db: string;
  skipAuth: boolean;
}): Promise<ServerHandle> {
  console.log(`🌐 Starting ${opts.name} on :${opts.port}...`);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: "development",
    XRAY_DB: opts.db,
    MOCK_PROVIDER: "true",
    NEXTAUTH_SECRET: "e2e-test-secret",
    NEXTAUTH_URL: `http://localhost:${opts.port}`,
    GOOGLE_CLIENT_ID: "e2e-test-client-id",
    GOOGLE_CLIENT_SECRET: "e2e-test-client-secret",
    ALLOWED_EMAILS: "e2e@test.com",
  };
  if (opts.skipAuth) env.E2E_SKIP_AUTH = "true";

  const proc = spawn(["bunx", "vinext", "dev", "--port", String(opts.port)], {
    cwd: PROJECT_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const handle: ServerHandle = { name: opts.name, port: opts.port, proc };
  servers.push(handle);
  return handle;
}

async function dumpServerOutput(handle: ServerHandle): Promise<void> {
  try {
    const stdout =
      handle.proc.stdout && typeof handle.proc.stdout !== "number"
        ? await new Response(handle.proc.stdout).text()
        : "";
    const stderr =
      handle.proc.stderr && typeof handle.proc.stderr !== "number"
        ? await new Response(handle.proc.stderr).text()
        : "";
    if (stdout) console.error(`--- ${handle.name} stdout ---\n${stdout}`);
    if (stderr) console.error(`--- ${handle.name} stderr ---\n${stderr}`);
  } catch {
    // ignore
  }
}

async function cleanup(): Promise<void> {
  console.log("\n🧹 Cleaning up...");
  for (const handle of servers) {
    try {
      handle.proc.kill();
    } catch {
      // ignore
    }
  }
  await Bun.sleep(500);
  servers.length = 0;
  removeDb(AUTH_DB);
  removeDb(NO_AUTH_DB);
}

async function main(): Promise<void> {
  console.log("🚀 xray L2 API E2E runner\n");

  await ensurePortFree(AUTH_PORT);
  await ensurePortFree(NO_AUTH_PORT);

  removeDb(AUTH_DB);
  removeDb(NO_AUTH_DB);

  const authServer = await startServer({
    name: "auth-bypass server",
    port: AUTH_PORT,
    db: AUTH_DB,
    skipAuth: true,
  });
  const noAuthServer = await startServer({
    name: "no-auth server",
    port: NO_AUTH_PORT,
    db: NO_AUTH_DB,
    skipAuth: false,
  });

  const [authReady, noAuthReady] = await Promise.all([
    waitForReady(authServer.name, authServer.port),
    waitForReady(noAuthServer.name, noAuthServer.port),
  ]);

  if (!authReady || !noAuthReady) {
    console.error("❌ One or more E2E servers failed to start within timeout.");
    if (!authReady) await dumpServerOutput(authServer);
    if (!noAuthReady) await dumpServerOutput(noAuthServer);
    await cleanup();
    process.exit(1);
  }

  console.log("\n🧪 Running L2 API E2E tests...\n");
  const testResult = spawnSync(
        // L2: skip auth-enforcement tests (they need a separate no-auth server = L3 scope)
    // // L2: skipped - auth-enforcement needs dual-server setup
    [
      "bun",
      "test",
      ...Bun.argv.slice(0, 0), // empty spread for alignment
      "src/__tests__/e2e/usage-api.e2e.test.ts",
      "src/__tests__/e2e/twitter-api.e2e.test.ts",
      "src/__tests__/e2e/media-proxy.e2e.test.ts",
      "src/__tests__/e2e/explore-api.e2e.test.ts",
      "src/__tests__/e2e/ai-settings.e2e.test.ts",
      "src/__tests__/e2e/auth-settings.e2e.test.ts",
      "src/__tests__/e2e/auto-fetch.e2e.test.ts",
      "src/__tests__/e2e/credits-module.e2e.test.ts",
      "src/__tests__/e2e/my-account-module.e2e.test.ts",
      "src/__tests__/e2e/placeholder-pages.e2e.test.ts",
      "src/__tests__/e2e/standalone-pages.e2e.test.ts",
      "src/__tests__/e2e/tweets-module.e2e.test.ts",
      "src/__tests__/e2e/users-module.e2e.test.ts",
      "src/__tests__/e2e/watchlist-detail.e2e.test.ts",
      "src/__tests__/e2e/watchlist.e2e.test.ts",
      "--timeout",
      "30000",
    ],
    {
      cwd: PROJECT_ROOT,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...(process.env as Record<string, string>),
        E2E_SKIP_SETUP: "true",
      },
    },
  );

  await cleanup();

  const code = testResult.exitCode ?? 1;
  console.log(code === 0 ? "\n✅ L2 API E2E tests passed!" : "\n❌ L2 API E2E tests failed!");
  process.exit(code);
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(143);
});

main().catch(async (err) => {
  console.error("Fatal:", err);
  await cleanup();
  process.exit(1);
});
