import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Subprocess } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

const E2E_PORT = 7028;
const E2E_DB = "database/xray.e2e.db";

let serverProcess: Subprocess | null = null;

/** Get the base URL for the E2E test server. */
export function getBaseUrl(): string {
  return `http://localhost:${E2E_PORT}`;
}

/**
 * Start the Next.js dev server for E2E testing.
 * Uses E2E_SKIP_AUTH=true to bypass authentication.
 */
export async function setupE2E(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "true") return;

  // Clean up any existing E2E database
  const dbPath = resolve(PROJECT_ROOT, E2E_DB);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unlinkSync } = require("fs");
    unlinkSync(dbPath);
  } catch {
    // File doesn't exist, that's fine
  }

  // Start Next.js dev server
  serverProcess = Bun.spawn(["bun", "next", "dev", "--port", String(E2E_PORT)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      XRAY_DB: E2E_DB,
      E2E_SKIP_AUTH: "true",
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
  await waitForServer(getBaseUrl(), 30_000);
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unlinkSync } = require("fs");
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
