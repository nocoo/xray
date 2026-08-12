// L2 globalSetup — one wrangler dev --local for the whole E2E run (bat pattern).
// Isolation: --local + --persist-to .wrangler/state-l2 + wipe + _test_marker + no remote CF env.

import { type ChildProcess, spawn } from "node:child_process";
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = join(__dirname, "../..");
const PERSIST_DIR = join(WORKER_ROOT, ".wrangler/state-l2");
const DEV_VARS_PATH = join(WORKER_ROOT, ".dev.vars");
const MIGRATIONS_DIR = join(WORKER_ROOT, "migrations");
const TEST_MARKER_SQL = join(__dirname, "fixtures/test_marker.sql");

export const L2_PORT = 18787;
export const L2_BASE = `http://127.0.0.1:${L2_PORT}`;

/** 32-byte ASCII KEK for L2 (matches unit-test style). */
const L2_KEK = "0123456789abcdef0123456789abcdef";

let wranglerProc: ChildProcess | null = null;
let devVarsBackup: string | null = null;

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 401 || res.status === 503 || res.status === 500) {
				return;
			}
		} catch {
			// not ready
		}
		await sleep(300);
	}
	throw new Error(`Wrangler L2 did not start within ${timeoutMs}ms on ${url}`);
}

async function runCommand(cmd: string[], cwd: string): Promise<string> {
	const [bin, ...args] = cmd;
	const proc = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
	let stdout = "";
	let stderr = "";
	proc.stdout?.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	proc.stderr?.on("data", (chunk) => {
		stderr += chunk.toString();
	});
	const exitCode: number = await new Promise((resolve, reject) => {
		proc.on("error", reject);
		proc.on("exit", (code) => resolve(code ?? 1));
	});
	if (exitCode !== 0) {
		throw new Error(`Command failed (exit ${exitCode}): ${cmd.join(" ")}\n${stderr}\n${stdout}`);
	}
	return stdout + stderr;
}

function discoverMigrations(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => /^\d{4}_.+\.sql$/.test(f))
		.sort()
		.map((f) => join("migrations", f));
}

function assertNoRemoteCloudflareEnv(): void {
	const offenders = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CF_API_TOKEN"].filter(
		(k) => process.env[k],
	);
	if (offenders.length > 0) {
		throw new Error(
			`L2 isolation guard: refusing to start with ${offenders.join(", ")} set. Unset and re-run.`,
		);
	}
}

export async function setup(): Promise<void> {
	assertNoRemoteCloudflareEnv();

	if (existsSync(DEV_VARS_PATH)) {
		devVarsBackup = readFileSync(DEV_VARS_PATH, "utf-8");
	}
	writeFileSync(
		DEV_VARS_PATH,
		[
			`XRAY_SECRETS_KEK=${L2_KEK}`,
			"XRAY_SECRETS_KEY_VERSION=1",
			"ZHETO_WEBHOOK_ALLOW_HOSTS=127.0.0.1,localhost",
			"",
		].join("\n"),
	);

	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}

	const dbName = "xray-db-test";
	const common = [
		"bunx",
		"wrangler",
		"d1",
		"execute",
		dbName,
		"--local",
		"--env",
		"test",
		"--persist-to",
		".wrangler/state-l2",
	];

	for (const migration of discoverMigrations()) {
		await runCommand([...common, "--file", migration], WORKER_ROOT);
	}
	await runCommand([...common, "--file", TEST_MARKER_SQL], WORKER_ROOT);

	const markerOut = await runCommand(
		[...common, "--command", "SELECT value FROM _test_marker WHERE key = 'env'"],
		WORKER_ROOT,
	);
	if (!markerOut.includes("test")) {
		throw new Error("L2 isolation: _test_marker.env != 'test'. Refusing to proceed.");
	}

	let wranglerLog = "";
	wranglerProc = spawn(
		"bunx",
		[
			"wrangler",
			"dev",
			"--env",
			"test",
			"--port",
			String(L2_PORT),
			"--ip",
			"127.0.0.1",
			"--local",
			"--persist-to",
			".wrangler/state-l2",
		],
		{ cwd: WORKER_ROOT, stdio: ["ignore", "pipe", "pipe"] },
	);
	wranglerProc.stdout?.on("data", (c) => {
		wranglerLog += c.toString();
	});
	wranglerProc.stderr?.on("data", (c) => {
		wranglerLog += c.toString();
	});
	wranglerProc.on("exit", (code) => {
		if (code != null && code !== 0) {
			wranglerLog += `\n[wrangler exited ${code}]\n`;
		}
	});

	try {
		// wrangler 4.12x cold start on CI can exceed 60s
		await waitForServer(`${L2_BASE}/api/live`, 120_000);
	} catch (e) {
		const tail = wranglerLog.slice(-4000);
		throw new Error(`${e instanceof Error ? e.message : String(e)}\n--- wrangler log ---\n${tail}`);
	}

	process.env.XRAY_L2_BASE = L2_BASE;
	process.env.XRAY_L2_PORT = String(L2_PORT);
}

export async function teardown(): Promise<void> {
	if (wranglerProc) {
		wranglerProc.kill("SIGTERM");
		wranglerProc = null;
	}
	if (devVarsBackup != null) {
		writeFileSync(DEV_VARS_PATH, devVarsBackup);
	} else if (existsSync(DEV_VARS_PATH)) {
		unlinkSync(DEV_VARS_PATH);
	}
	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}
}
