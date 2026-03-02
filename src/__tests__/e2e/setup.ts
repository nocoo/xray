import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { unlinkSync } from "fs";
import { Subprocess } from "bun";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

const E2E_PORT = 17027;
const E2E_DB = "database/xray.e2e.db";

let serverProcess: Subprocess | null = null;

/** Get the base URL for the E2E test server. */
export function getBaseUrl(): string {
  return `http://localhost:${E2E_PORT}`;
}

/**
 * Kill any process listening on the given port.
 * Uses lsof (macOS/Linux) to find and SIGKILL the occupying process.
 * Silently succeeds if no process is found.
 */
async function killPortProcess(port: number): Promise<void> {
  try {
    const result = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`]);
    const pids = result.stdout.toString().trim();
    if (!pids) return;

    for (const pid of pids.split("\n")) {
      const p = pid.trim();
      if (p) {
        Bun.spawnSync(["kill", "-9", p]);
      }
    }
    // Give the OS a moment to release the port
    await Bun.sleep(500);
  } catch {
    // lsof not available or no process found — safe to continue
  }
}

/**
 * Check if a server is already healthy on the given base URL.
 * Returns true if the health endpoint responds successfully.
 */
async function isServerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/providers`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start the vinext dev server for E2E testing.
 * Uses E2E_SKIP_AUTH=true to bypass authentication.
 */
export async function setupE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;

  // If server is already running and healthy, reuse it
  if (await isServerHealthy(getBaseUrl())) return;

  // Kill any stale process occupying the port
  await killPortProcess(E2E_PORT);

  // Clean up any existing E2E database
  const dbPath = resolve(PROJECT_ROOT, E2E_DB);
  try {
    unlinkSync(dbPath);
  } catch {
    // File doesn't exist, that's fine
  }

  // Start vinext dev server
  serverProcess = Bun.spawn(["npx", "vinext", "dev", "--port", String(E2E_PORT)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      XRAY_DB: E2E_DB,
      E2E_SKIP_AUTH: "true",
      MOCK_PROVIDER: "true",
      NEXTAUTH_SECRET: "e2e-test-secret",
      NEXTAUTH_URL: `http://localhost:${E2E_PORT}`,
      GOOGLE_CLIENT_ID: "e2e-test-client-id",
      GOOGLE_CLIENT_SECRET: "e2e-test-client-secret",
      ALLOWED_EMAILS: "e2e@test.com",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to be ready
  await waitForServer(getBaseUrl(), 60_000);
}

/** Stop the E2E test server. */
export async function teardownE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;

  if (serverProcess) {
    serverProcess.kill();
    await serverProcess.exited;
    serverProcess = null;
  }

  // Clean up E2E database
  const dbPath = resolve(PROJECT_ROOT, E2E_DB);
  try {
    unlinkSync(dbPath);
  } catch {
    // Already cleaned or doesn't exist
  }
}

/**
 * Make a typed API request to the E2E server.
 */
export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<{ status: number; data: T }> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = (await res.json()) as T;
  return { status: res.status, data };
}

/**
 * Make an API request that returns SSE (text/event-stream).
 * Collects all events and returns them as an array.
 */
export async function apiRequestSSE(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; events: { event: string; data: unknown }[] }> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const contentType = res.headers.get("content-type") ?? "";

  // If server returned JSON (e.g. empty watchlist or error), wrap it as a synthetic "done" event
  if (contentType.includes("application/json")) {
    const json = await res.json();
    return {
      status: res.status,
      events: [{ event: "done", data: (json as { data?: unknown }).data ?? json }],
    };
  }

  // Parse SSE text
  const text = await res.text();
  const events: { event: string; data: unknown }[] = [];
  for (const block of text.split("\n\n")) {
    if (!block.trim()) continue;
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (event && data) {
      events.push({ event, data: JSON.parse(data) });
    }
  }
  return { status: res.status, events };
}

/** Poll the server until it responds or timeout. */
async function waitForServer(
  baseUrl: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/providers`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(pollInterval);
  }

  throw new Error(`E2E server did not start within ${timeoutMs}ms`);
}

/**
 * Seed a webhook key into the E2E database for Twitter API testing.
 * Opens a direct connection to the E2E DB file and inserts a webhook row.
 * Returns the raw webhook key (not the hash).
 */
export function seedWebhookKey(userId: string = "e2e-test-user"): string {
  const dbPath = resolve(PROJECT_ROOT, E2E_DB);

  // Seed user first (webhooks have FK to user)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Database } = require("bun:sqlite");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      emailVerified INTEGER,
      image TEXT
    );
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER NOT NULL
    );
  `);

  // Upsert user
  db.run(
    `INSERT OR IGNORE INTO user (id, name, email) VALUES (?, ?, ?)`,
    [userId, "E2E Test User", "e2e@test.com"],
  );

  // Create webhook
  const key = generateWebhookKey();
  const now = Date.now();
  db.run(
    `INSERT INTO webhooks (user_id, key_hash, key_prefix, created_at, rotated_at) VALUES (?, ?, ?, ?, ?)`,
    [userId, hashWebhookKey(key), getKeyPrefix(key), now, now],
  );

  db.close();
  return key;
}

// =============================================================================
// No-auth server — a separate vinext instance WITHOUT E2E_SKIP_AUTH
// for testing 401 enforcement on protected routes.
// =============================================================================

const NO_AUTH_PORT = 17029;
const NO_AUTH_DB = "database/xray.noauth.db";

let noAuthProcess: Subprocess | null = null;

/** Get the base URL for the no-auth E2E server. */
export function getNoAuthBaseUrl(): string {
  return `http://localhost:${NO_AUTH_PORT}`;
}

/**
 * Start a vinext dev server WITHOUT auth bypass.
 * Requests to protected routes will return 401 since there is no session.
 */
export async function setupNoAuthE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;

  // If server is already running and healthy, reuse it
  if (await isServerHealthy(getNoAuthBaseUrl())) return;

  // Kill any stale process occupying the port
  await killPortProcess(NO_AUTH_PORT);

  // Clean up any existing no-auth database
  const dbPath = resolve(PROJECT_ROOT, NO_AUTH_DB);
  try {
    unlinkSync(dbPath);
  } catch {
    // File doesn't exist, that's fine
  }

  // Start vinext dev server WITHOUT E2E_SKIP_AUTH
  noAuthProcess = Bun.spawn(["npx", "vinext", "dev", "--port", String(NO_AUTH_PORT)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      XRAY_DB: NO_AUTH_DB,
      MOCK_PROVIDER: "true",
      NEXTAUTH_SECRET: "e2e-test-secret",
      NEXTAUTH_URL: `http://localhost:${NO_AUTH_PORT}`,
      GOOGLE_CLIENT_ID: "e2e-test-client-id",
      GOOGLE_CLIENT_SECRET: "e2e-test-client-secret",
      ALLOWED_EMAILS: "e2e@test.com",
      // NOTE: E2E_SKIP_AUTH is intentionally NOT set
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  await waitForServer(getNoAuthBaseUrl(), 60_000);
}

/** Stop the no-auth E2E server. */
export async function teardownNoAuthE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;

  if (noAuthProcess) {
    noAuthProcess.kill();
    await noAuthProcess.exited;
    noAuthProcess = null;
  }

  const dbPath = resolve(PROJECT_ROOT, NO_AUTH_DB);
  try {
    unlinkSync(dbPath);
  } catch {
    // Already cleaned or doesn't exist
  }
}
