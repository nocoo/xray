import { execFileSync } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { readFile, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	isMode,
	type LocalRuntime,
	type Mode,
	ROOT,
	startLocalRuntime,
} from "../../worker/dev/local-runtime";

const PROD_ORIGIN = "https://xray.hexly.ai";
export type Descriptor = {
	local: boolean;
	mode: Mode | null;
	locked: boolean;
	automated: boolean;
	instanceId: string | null;
	csrfToken: string;
	ingestBase: string | null;
};
type Target = { mode: Mode; instanceId: string; url: string; runtime?: LocalRuntime };
type Options = {
	mode?: Mode;
	automated?: boolean;
	hosted?: boolean;
	port?: number;
	built?: boolean;
	catalog?: "demo" | "empty";
};

function localOrigin(req: IncomingMessage, port: number) {
	const host = req.headers.host;
	if (!host || !["xray.dev.hexly.ai", `127.0.0.1:${port}`, `localhost:${port}`].includes(host))
		return false;
	const origin = req.headers.origin;
	return (
		req.headers["sec-fetch-site"] !== "cross-site" &&
		(!origin || origin === `http://${host}` || origin === `https://${host}`)
	);
}

async function readBody(req: IncomingMessage) {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const value of req) {
		const chunk = Buffer.from(value);
		size += chunk.length;
		if (size > 2 * 1024 * 1024) throw new Error("Request body exceeds local limit");
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
	res.end(JSON.stringify(body));
}

export async function startLocalServer(options: Options = {}) {
	if (options.automated && options.mode !== "e2e")
		throw new Error("Automated instances require E2E");
	const csrfToken = randomUUID();
	let target: Target | undefined;
	const locked = !!options.automated;
	let selection: Promise<Descriptor> | undefined;
	let closing = false;
	let closed: Promise<void> | undefined;
	const owned = new Set<LocalRuntime>();
	const release = async (runtime: LocalRuntime | undefined) => {
		if (!runtime) return;
		await runtime.stop();
		owned.delete(runtime);
	};
	let vite:
		| {
				middlewares: (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;
				close(): Promise<void>;
		  }
		| undefined;
	let port = options.port ?? 7007;
	let prodToken = "";
	let prodTokenExpiry = 0;
	const descriptor = (): Descriptor => ({
		local: !options.hosted,
		mode: target?.mode ?? null,
		locked,
		automated: !!options.automated,
		instanceId: target?.instanceId ?? null,
		csrfToken,
		ingestBase: target
			? target.mode === "prod"
				? "https://xray-ingest.worker.hexly.ai"
				: target.url
			: null,
	});
	const select = async (mode: Mode) => {
		if (closing) throw new Error("Local environment is shutting down");
		if (locked && mode !== "e2e") throw new Error("E2E is locked until this instance stops");
		if (target?.mode === mode) return descriptor();
		if (selection) throw new Error("An environment switch is already in progress");
		selection = (async () => {
			const previous = target;
			const runtime =
				mode === "prod" ? undefined : await startLocalRuntime(mode, { catalog: options.catalog });
			if (runtime) owned.add(runtime);
			try {
				if (closing) throw new Error("Local environment is shutting down");
				await release(previous?.runtime);
				if (closing) throw new Error("Local environment is shutting down");
				target = {
					mode,
					instanceId: runtime?.instanceId ?? randomUUID(),
					url: runtime?.url ?? PROD_ORIGIN,
					runtime,
				};
				prodToken = "";
				prodTokenExpiry = 0;
				return descriptor();
			} catch (error) {
				await release(runtime);
				throw error;
			}
		})().finally(() => {
			selection = undefined;
		});
		return selection;
	};
	const server = createServer((req, res) => {
		void (async () => {
			if (!localOrigin(req, port)) {
				json(res, 403, { error: "Local origin required" });
				return;
			}
			const url = new URL(req.url ?? "/", "http://local.invalid");
			if (url.pathname === "/__local/environment" && req.method === "GET") {
				json(res, 200, descriptor());
				return;
			}
			if (url.pathname === "/__local/environment/select") {
				const csrf = req.headers["x-xray-local-csrf"];
				if (
					req.method !== "POST" ||
					!req.headers.origin ||
					typeof csrf !== "string" ||
					Buffer.byteLength(csrf) !== Buffer.byteLength(csrfToken) ||
					!timingSafeEqual(Buffer.from(csrf), Buffer.from(csrfToken))
				) {
					json(res, 403, { error: "Invalid local selection request" });
					return;
				}
				const input = JSON.parse((await readBody(req)).toString()) as {
					mode?: unknown;
					instanceId?: unknown;
				};
				if (!isMode(input.mode) || input.instanceId !== (target?.instanceId ?? null)) {
					json(res, 409, { error: "Invalid or expired environment instance" });
					return;
				}
				if (locked && input.mode !== "e2e") {
					json(res, 409, { error: "E2E is locked until shutdown" });
					return;
				}
				json(res, 200, await select(input.mode));
				return;
			}
			const match = /^\/__local\/instances\/([^/]+)(\/api\/.*)$/.exec(url.pathname);
			if (match) {
				const captured = target;
				if (!captured || match[1] !== captured.instanceId) {
					json(res, 409, { error: "Environment instance expired. Reload explicitly." });
					return;
				}
				const headers = new Headers();
				for (const [name, value] of Object.entries(req.headers)) {
					if (
						value &&
						!["host", "cookie", "authorization", "connection", "content-length"].includes(name) &&
						!name.startsWith("cf-") &&
						!name.startsWith("x-test-") &&
						!name.startsWith("x-xray-local-")
					)
						headers.set(name, Array.isArray(value) ? value.join(",") : value);
				}
				if (captured.mode === "prod") {
					if (locked || options.automated) {
						json(res, 403, { error: "Production unavailable" });
						return;
					}
					try {
						if (Date.now() >= prodTokenExpiry) {
							prodToken = execFileSync("cloudflared", ["access", "token", "--app", PROD_ORIGIN], {
								encoding: "utf8",
								timeout: 5000,
								stdio: ["ignore", "pipe", "pipe"],
							}).trim();
							prodTokenExpiry = Date.now() + 60_000;
						}
						if (!prodToken) throw new Error("Missing credential");
					} catch {
						json(res, 401, { error: "Production sign-in required. Run bun run login:prod." });
						return;
					}
					headers.set("cookie", `CF_Authorization=${prodToken}`);
					headers.set("origin", PROD_ORIGIN);
					headers.set("sec-fetch-site", "same-origin");
				} else if (captured.runtime)
					headers.set("Cf-Access-Jwt-Assertion", await captured.runtime.token());
				const body =
					req.method === "GET" || req.method === "HEAD"
						? undefined
						: new Uint8Array(await readBody(req));
				const response = await fetch(`${captured.url}${match[2]}${url.search}`, {
					method: req.method,
					headers,
					body,
					redirect: "manual",
					signal: AbortSignal.timeout(180_000),
				});
				if (
					captured.mode === "prod" &&
					(response.headers.has("location") ||
						response.headers.get("content-type")?.includes("text/html"))
				) {
					prodTokenExpiry = 0;
					await response.body?.cancel();
					json(res, 401, { error: "Production sign-in required. Run bun run login:prod." });
					return;
				}
				if ([401, 403].includes(response.status)) prodTokenExpiry = 0;
				await forward(response, res);
				return;
			}
			if (
				url.pathname.startsWith("/__local/") ||
				url.pathname.startsWith("/__product/") ||
				url.pathname.startsWith("/api/")
			) {
				json(res, 404, { error: "Not found" });
				return;
			}
			if (vite) {
				vite.middlewares(req, res);
				return;
			}
			await serveBuilt(url.pathname, req.method, res);
		})().catch((error: unknown) => {
			if (!res.headersSent)
				json(res, 503, {
					error: error instanceof Error ? error.message : "Local environment unavailable",
				});
			else res.destroy();
		});
	});
	const close = () =>
		(closed ??= (async () => {
			closing = true;
			await selection?.catch(() => {});
			server.closeAllConnections();
			const listener = server.listening
				? new Promise<void>((done, reject) =>
						server.close((error) => (error ? reject(error) : done())),
					)
				: Promise.resolve();
			const results = await Promise.allSettled([
				listener,
				vite?.close(),
				...Array.from(owned, release),
			]);
			const errors = results
				.filter((result) => result.status === "rejected")
				.map((result) => result.reason);
			if (errors.length) throw new AggregateError(errors, "Local environment cleanup failed");
			target = undefined;
		})().catch((error: unknown) => {
			closed = undefined;
			throw error;
		}));
	try {
		if (options.mode) await select(options.mode);
		if (!options.built) {
			const { createServer: createVite } = await import("vite");
			vite = await createVite({
				root: `${ROOT}/packages/ui`,
				configFile: `${ROOT}/packages/ui/vite.config.ts`,
				plugins: [
					{
						name: "xray-local-capability",
						transformIndexHtml: () => [
							{ tag: "script", children: "window.__XRAY_LOCAL__=true", injectTo: "head-prepend" },
						],
					},
				],
				server: { middlewareMode: true, hmr: { server }, watch: { ignored: ["**/.wrangler/**"] } },
			});
		}
		server.listen(port, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Local listener missing");
		port = address.port;
		return {
			url: `http://127.0.0.1:${port}`,
			descriptor,
			get runtime() {
				return target?.runtime;
			},
			close,
		};
	} catch (error) {
		await close();
		throw error;
	}
}

async function serveBuilt(pathname: string, method: string | undefined, res: ServerResponse) {
	if (method !== "GET" && method !== "HEAD") {
		json(res, 405, { error: "Method not allowed" });
		return;
	}
	const root = await realpath(resolve(ROOT, "packages/worker/static"));
	const requested = resolve(root, `.${decodeURIComponent(pathname)}`);
	if (!requested.startsWith(`${root}/`) && requested !== root) {
		json(res, 404, { error: "Not found" });
		return;
	}
	let path = await realpath(requested).catch(() => "");
	if (!path || !extname(path)) path = resolve(root, "index.html");
	if (!path.startsWith(`${root}/`)) {
		json(res, 404, { error: "Not found" });
		return;
	}
	const bytes = await readFile(path);
	const extension = extname(path);
	const types: Record<string, string> = {
		".html": "text/html; charset=utf-8",
		".js": "text/javascript",
		".css": "text/css",
		".svg": "image/svg+xml",
		".png": "image/png",
		".ico": "image/x-icon",
		".woff2": "font/woff2",
		".json": "application/json",
	};
	const body =
		extension === ".html"
			? bytes.toString().replace("<head>", "<head><script>window.__XRAY_LOCAL__=true</script>")
			: bytes;
	res.writeHead(200, {
		"content-type": types[extension] ?? "application/octet-stream",
		"cache-control": "no-store",
	});
	res.end(method === "HEAD" ? undefined : body);
}

async function forward(response: Response, res: ServerResponse) {
	res.statusCode = response.status;
	response.headers.forEach((value, name) => {
		if (
			![
				"set-cookie",
				"content-encoding",
				"content-length",
				"transfer-encoding",
				"connection",
			].includes(name)
		)
			res.setHeader(name, value);
	});
	res.setHeader("cache-control", "no-store");
	if (response.body)
		await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), res);
	else res.end();
}
