import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { e2eCatalog } from "../../../fixtures/e2e";
import {
	DEMO_IDENTITY,
	FIXTURE_ANCHOR_ISO,
	FIXTURE_VERSION,
	fixtureIdentity as identityForRun,
	OTHER_IDENTITY,
} from "../../../fixtures/primitives";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WRANGLER = join(ROOT, "packages/worker/node_modules/wrangler/bin/wrangler.js");
export const STATE_ROOT = join(ROOT, "packages/worker/.wrangler/environments");
export const PRESENTATION_TIME = FIXTURE_ANCHOR_ISO;
export type LocalMode = "demo" | "e2e";
export type Mode = LocalMode | "prod";

export function isMode(value: unknown): value is Mode {
	return value === "demo" || value === "e2e" || value === "prod";
}

export function isolatedEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return {
		PATH: source.PATH,
		HOME: source.HOME,
		TMPDIR: source.TMPDIR,
		LANG: source.LANG,
		CI: "true",
		WRANGLER_SEND_METRICS: "false",
		WRANGLER_HIDE_BANNER: "true",
		CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
		CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
	};
}

export function assertTestCredentials(source: NodeJS.ProcessEnv = process.env) {
	const names = Object.keys(source).filter(
		(name) =>
			source[name] &&
			/^(CLOUDFLARE_(API_TOKEN|ACCOUNT_ID|API_KEY)|CF_(API_TOKEN|API_KEY)|XRAY_(PUSH_TOKEN|INGEST_TOKEN)|CF_ACCESS_CLIENT_(ID|SECRET))$/.test(
				name,
			),
	);
	if (names.length) throw new Error(`E2E refuses production credentials: ${names.join(", ")}`);
}

export async function availablePort(): Promise<number> {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No local port allocated");
	await new Promise<void>((resolveClose, reject) =>
		server.close((error) => (error ? reject(error) : resolveClose())),
	);
	return address.port;
}

type Owner = {
	version: 1;
	mode: LocalMode;
	id: string;
	fixtureVersion: number;
	initialized: boolean;
};
export type OwnedState = { path: string; owner: Owner };

export async function validateOwned(state: OwnedState) {
	const root = await realpath(STATE_ROOT);
	const target = await realpath(state.path);
	if (
		target !== state.path ||
		dirname(target) !== root ||
		(await lstat(state.path)).isSymbolicLink()
	) {
		throw new Error("Refusing foreign environment path");
	}
	const actual = JSON.parse(await readFile(join(target, "owner.json"), "utf8")) as Owner;
	if (
		actual.version !== 1 ||
		actual.mode !== state.owner.mode ||
		actual.id !== state.owner.id ||
		actual.initialized !== state.owner.initialized ||
		actual.fixtureVersion !== state.owner.fixtureVersion
	) {
		throw new Error("Environment ownership mismatch");
	}
}

export async function createOwned(mode: LocalMode): Promise<OwnedState> {
	await mkdir(STATE_ROOT, { recursive: true, mode: 0o700 });
	if ((await realpath(STATE_ROOT)) !== STATE_ROOT)
		throw new Error("Environment root must not be a symlink");
	const path = mode === "demo" ? join(STATE_ROOT, "demo") : await mkdtemp(join(STATE_ROOT, "e2e-"));
	if (mode === "demo" && existsSync(path)) {
		const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8")) as Owner;
		if (owner.mode !== "demo") throw new Error("Demo ownership mismatch");
		const state = { path, owner };
		await validateOwned(state);
		return state;
	}
	await mkdir(path, { recursive: true, mode: 0o700 });
	const owner: Owner = {
		version: 1,
		mode,
		id: randomUUID(),
		fixtureVersion: 0,
		initialized: false,
	};
	await writeFile(join(path, "owner.json"), JSON.stringify(owner), { mode: 0o600, flag: "wx" });
	return { path, owner };
}

export async function removeOwned(state: OwnedState) {
	await validateOwned(state);
	const lock = join(state.path, "active.lock");
	await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 });
	try {
		if (state.owner.initialized) {
			const inspection = await mkdtemp(join(state.path, "inspect-"));
			try {
				const config = join(inspection, "wrangler.json");
				await writeFile(
					config,
					JSON.stringify({
						name: "xray-local-cleanup",
						compatibility_date: "2026-08-08",
						d1_databases: [
							{
								binding: "DB",
								database_name: "xray-local",
								database_id: state.owner.id,
								remote: false,
							},
						],
					}),
				);
				const output = await runWrangler(
					[
						"d1",
						"execute",
						"DB",
						"--local",
						"--config",
						config,
						"--persist-to",
						join(state.path, "d1"),
						"--command",
						"SELECT key,value FROM _test_marker",
						"--json",
					],
					inspection,
				);
				const parsed = JSON.parse(output) as Array<{
					results: Array<{ key: string; value: string }>;
				}>;
				const marker = Object.fromEntries(
					(parsed[0]?.results ?? []).map((row) => [row.key, row.value]),
				);
				if (marker.owner !== state.owner.id || marker.env !== state.owner.mode)
					throw new Error("Refusing cleanup: D1 ownership marker mismatch");
			} finally {
				await rm(inspection, { recursive: true });
			}
		}
		await validateOwned(state);
		await rm(state.path, { recursive: true });
	} catch (error) {
		await rm(lock);
		throw error;
	}
}

export async function runWrangler(args: string[], cwd: string): Promise<string> {
	const child = spawn("node", [WRANGLER, ...args], {
		cwd,
		env: isolatedEnv(),
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	let diagnostic = "";
	child.stdout.on("data", (data) => {
		output += String(data);
	});
	child.stderr.on("data", (data) => {
		diagnostic = (diagnostic + String(data)).slice(-6000);
	});
	const timer = setTimeout(() => {
		if (child.pid) process.kill(-child.pid, "SIGKILL");
	}, 90_000);
	try {
		const [code] = await once(child, "exit");
		if (code !== 0)
			throw new Error(
				`Local Wrangler ${args.slice(0, 3).join(" ")} failed (${code}): ${diagnostic}`,
			);
		return output;
	} finally {
		clearTimeout(timer);
	}
}

export async function fixtureIdentity(runId?: string) {
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const kid = randomUUID();
	const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" }] };
	const token = async (actor: "a" | "b" = "a") => {
		const who = runId
			? identityForRun(runId, actor === "a" ? "owner" : "other")
			: actor === "a"
				? DEMO_IDENTITY
				: OTHER_IDENTITY;
		return new SignJWT({ email: who.email, name: who.name })
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer("https://identity.xray.test")
			.setAudience("xray-local")
			.setSubject(who.sub)
			.setIssuedAt()
			.setExpirationTime("3h")
			.sign(privateKey);
	};
	return { jwks, token };
}

async function stopChild(child: ChildProcess) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = once(child, "exit");
	child.kill("SIGTERM");
	const timeout = setTimeout(() => {
		if (child.pid) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {}
		}
	}, 10_000);
	try {
		await exited;
	} finally {
		clearTimeout(timeout);
	}
}

export async function startLocalRuntime(
	mode: LocalMode,
	options: { port?: number; catalog?: "demo" | "empty"; scenario?: string } = {},
) {
	if (mode === "e2e") assertTestCredentials();
	const state = await createOwned(mode);
	await validateOwned(state);
	if (state.owner.initialized && !state.owner.fixtureVersion)
		throw new Error("Initial fixtures are incomplete. Reset this owned Demo explicitly.");
	const lock = join(state.path, "active.lock");
	await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 });
	let runDir: string;
	try {
		runDir = await mkdtemp(join(state.path, "runtime-"));
	} catch (error) {
		await rm(lock);
		if (mode === "e2e") await removeOwned(state);
		throw error;
	}
	const instanceId = randomUUID();
	let child: ChildProcess | undefined;
	let markerCreated = state.owner.initialized;
	let stopping: Promise<void> | undefined;
	const config = join(runDir, "wrangler.json");
	const persist = join(state.path, "d1");
	const common = ["--local", "--config", config, "--persist-to", persist];
	const sql = async (query: string) => {
		await validateOwned(state);
		const current = JSON.parse(await readFile(config, "utf8"));
		if (
			current.d1_databases?.length !== 1 ||
			current.d1_databases[0].database_id !== state.owner.id ||
			current.d1_databases[0].remote !== false ||
			!["development", "test"].includes(current.vars?.ENVIRONMENT)
		)
			throw new Error("Local D1 configuration changed");
		const output = await runWrangler(
			["d1", "execute", "DB", ...common, "--command", query, "--json"],
			runDir,
		);
		return JSON.parse(output) as Array<{ results: Array<Record<string, unknown>> }>;
	};
	const verifyMarker = async () => {
		const result = await sql("SELECT key, value FROM _test_marker");
		const values = Object.fromEntries(
			(result[0]?.results ?? []).map((row) => [row.key, row.value]),
		);
		if (values.owner !== state.owner.id || values.env !== mode)
			throw new Error("D1 ownership marker mismatch");
	};
	const stop = () =>
		(stopping ??= (async () => {
			if (child) {
				await stopChild(child);
				child = undefined;
			}
			await validateOwned(state);
			if (markerCreated) await verifyMarker();
			if (mode === "demo") await rm(runDir, { recursive: true });
			await rm(lock, { force: true });
			if (mode === "e2e") await removeOwned(state);
		})().catch((error: unknown) => {
			stopping = undefined;
			throw error;
		}));
	try {
		const identity = await fixtureIdentity(mode === "e2e" ? instanceId : undefined);
		const secretPath = join(state.path, "fixture-secret");
		if (!existsSync(secretPath))
			await writeFile(secretPath, Buffer.from(randomBytes(32)).toString("base64"), {
				mode: 0o600,
				flag: "wx",
			});
		const kek = await readFile(secretPath, "utf8");
		await writeFile(
			join(runDir, ".dev.vars"),
			`XRAY_SECRETS_KEK=${kek}\nXRAY_SECRETS_KEY_VERSION=1\n`,
			{ mode: 0o600 },
		);
		const fixtureName = `xray-fixtures-${instanceId}`;
		const vars = {
			ENVIRONMENT: mode === "demo" ? "development" : "test",
			CF_ACCESS_TEAM_DOMAIN: "identity.xray.test",
			CF_ACCESS_AUD: "xray-local",
			XRAY_LOCAL_JWKS: JSON.stringify(identity.jwks),
			XRAY_PRESENTATION_TIME: PRESENTATION_TIME,
		};
		await writeFile(
			config,
			JSON.stringify({
				name: `xray-local-${instanceId}`,
				main: join(ROOT, "packages/worker/src/index.ts"),
				compatibility_date: "2026-08-08",
				workers_dev: false,
				preview_urls: false,
				vars,
				d1_databases: [
					{
						binding: "DB",
						database_name: "xray-local",
						database_id: state.owner.id,
						migrations_dir: join(ROOT, "packages/worker/migrations"),
						remote: false,
					},
				],
				services: [{ binding: "XRAY_EXTERNAL", service: fixtureName, remote: false }],
				ratelimits: [
					{ name: "XRAY_INGEST_RL", namespace_id: "1001", simple: { limit: 60, period: 60 } },
				],
				assets: {
					directory: join(ROOT, "packages/worker/static"),
					binding: "ASSETS",
					run_worker_first: true,
					not_found_handling: "single-page-application",
				},
			}),
			{ mode: 0o600 },
		);
		const fixtureConfig = join(runDir, "fixtures.json");
		await writeFile(
			fixtureConfig,
			JSON.stringify({
				name: fixtureName,
				main: join(ROOT, "fixtures/providers.ts"),
				compatibility_date: "2026-08-08",
				workers_dev: false,
				preview_urls: false,
				vars: { XRAY_FIXTURE_SCENARIO: options.scenario ?? "success" },
			}),
		);
		if (state.owner.fixtureVersion) await verifyMarker();
		await runWrangler(["d1", "migrations", "apply", "DB", ...common], runDir);
		if (!state.owner.fixtureVersion) {
			await sql(
				`CREATE TABLE _test_marker (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO _test_marker VALUES ('owner','${state.owner.id}'),('env','${mode}');`,
			);
			markerCreated = true;
			state.owner.initialized = true;
			await writeFile(join(state.path, "owner.json"), JSON.stringify(state.owner), { mode: 0o600 });
			await verifyMarker();
			if (mode === "demo" || options.catalog === "demo") {
				let seed = await readFile(join(ROOT, "fixtures/demo.sql"), "utf8");
				if (mode === "e2e") {
					for (const [original, role] of [
						[DEMO_IDENTITY, "owner"],
						[OTHER_IDENTITY, "other"],
					] as const) {
						const who = identityForRun(instanceId, role);
						for (const key of ["id", "sub", "email"] as const)
							seed = seed.replaceAll(original[key], who[key]);
					}
				}
				const seedPath = join(runDir, "initial.sql");
				await writeFile(seedPath, seed);
				await runWrangler(["d1", "execute", "DB", ...common, "--file", seedPath], runDir);
			}
		}
		const port = options.port ?? (await availablePort());
		const inspectorPort = await availablePort();
		child = spawn(
			"node",
			[
				WRANGLER,
				"dev",
				"--local",
				"--config",
				config,
				"--config",
				fixtureConfig,
				"--persist-to",
				persist,
				"--ip",
				"127.0.0.1",
				"--port",
				String(port),
				"--inspector-port",
				String(inspectorPort),
				"--log-level",
				"error",
				"--show-interactive-dev-session=false",
			],
			{ cwd: runDir, env: isolatedEnv(), detached: true, stdio: ["ignore", "pipe", "pipe"] },
		);
		let log = "";
		for (const stream of [child.stdout, child.stderr])
			stream?.on("data", (data) => {
				log = (log + String(data)).slice(-12000);
			});
		const url = `http://127.0.0.1:${port}`;
		const jwtA = await identity.token("a");
		const jwtB = await identity.token("b");
		const deadline = Date.now() + 90_000;
		let ready = false;
		while (Date.now() < deadline) {
			if (child.exitCode !== null) throw new Error(`Local Worker exited before readiness: ${log}`);
			try {
				const response = await fetch(`${url}/api/me`, {
					headers: { "Cf-Access-Jwt-Assertion": jwtA },
					signal: AbortSignal.timeout(1000),
				});
				if (
					response.ok &&
					((await response.json()) as { authenticated?: boolean }).authenticated === true
				) {
					ready = true;
					break;
				}
			} catch {}
			await delay(200);
		}
		if (!ready) {
			await mkdir(join(ROOT, "test-results"), { recursive: true });
			await writeFile(join(ROOT, "test-results", `startup-${instanceId}.log`), log);
			throw new Error("Local Worker failed authenticated readiness");
		}
		if (!state.owner.fixtureVersion) {
			if (mode === "demo" || options.catalog === "demo") {
				const catalog = e2eCatalog(instanceId);
				for (const [path, body] of [
					["/api/ai-config", catalog.ai],
					["/api/integrations/zheto", catalog.zheto],
				] as const) {
					const response = await fetch(`${url}${path}`, {
						method: "PUT",
						headers: {
							"Cf-Access-Jwt-Assertion": jwtA,
							origin: url,
							"content-type": "application/json",
						},
						body: JSON.stringify(body),
						signal: AbortSignal.timeout(10_000),
					});
					if (!response.ok)
						throw new Error(`Fixture settings failed: ${path} (${response.status})`);
					await response.body?.cancel();
				}
			}
			state.owner.fixtureVersion = FIXTURE_VERSION;
			await writeFile(join(state.path, "owner.json"), JSON.stringify(state.owner), { mode: 0o600 });
		}
		return {
			mode,
			instanceId,
			url,
			state,
			jwtA,
			jwtB,
			token: identity.token,
			sql,
			verifyMarker,
			stop,
		};
	} catch (error) {
		await stop();
		throw error;
	}
}

export type LocalRuntime = Awaited<ReturnType<typeof startLocalRuntime>>;
