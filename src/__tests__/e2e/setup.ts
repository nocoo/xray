import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

const E2E_PORT = 17007;
const E2E_DB = "database/xray.e2e.db";
const NO_AUTH_PORT = 17029;
const NO_AUTH_DB = "database/xray.noauth.db";

/** Get the base URL for the E2E test server. */
export function getBaseUrl(): string {
  return `http://localhost:${E2E_PORT}`;
}

/** Get the base URL for the no-auth E2E server. */
export function getNoAuthBaseUrl(): string {
  return `http://localhost:${NO_AUTH_PORT}`;
}

/**
 * Verify a server is reachable on the given base URL.
 * Throws if the health endpoint does not respond within the timeout.
 *
 * Server lifecycle is owned by `scripts/run-e2e-api.ts`; tests just
 * confirm the runner-spawned server is actually up before proceeding.
 */
async function assertServerHealthy(baseUrl: string, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/providers`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return;
      lastError = new Error(`status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `${label} not reachable at ${baseUrl}. Run \`bun run test:e2e:api\` instead of \`bun test\` directly. (last error: ${String(lastError)})`,
  );
}

/**
 * Confirm the E2E auth-bypass server is reachable.
 * Server is started by `scripts/run-e2e-api.ts` before tests begin.
 */
export async function setupE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;
  await assertServerHealthy(getBaseUrl(), "E2E auth-bypass server");
}

/**
 * No-op teardown — the runner owns server lifecycle.
 * Kept for API compatibility with existing test files.
 */
export async function teardownE2E(): Promise<void> {
  // Intentionally empty.
}

/**
 * Confirm the no-auth E2E server is reachable.
 * Server is started by `scripts/run-e2e-api.ts` before tests begin.
 */
export async function setupNoAuthE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;
  await assertServerHealthy(getNoAuthBaseUrl(), "E2E no-auth server");
}

/**
 * No-op teardown — the runner owns server lifecycle.
 * Kept for API compatibility with existing test files.
 */
export async function teardownNoAuthE2E(): Promise<void> {
  // Intentionally empty.
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

// Re-export DB path constants for tests that need them.
export { E2E_DB, NO_AUTH_DB };
