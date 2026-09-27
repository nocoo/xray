// @vitest-environment node

import type { IncomingHttpHeaders } from "node:http";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Descriptor, startLocalServer } from "./local-server";

const mocks = vi.hoisted(() => ({
	start: vi.fn(),
	exec: vi.fn(),
	upstream: vi.fn(),
	vite: vi.fn(),
	viteClose: vi.fn(),
	middleware: vi.fn(),
	readFile: vi.fn(),
	realpath: vi.fn(),
}));
vi.mock("../../worker/dev/local-runtime", () => ({
	ROOT: "/virtual/xray",
	isMode: (value: unknown) => ["demo", "e2e", "prod"].includes(String(value)),
	startLocalRuntime: mocks.start,
}));
vi.mock("node:child_process", () => ({ execFileSync: mocks.exec }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile, realpath: mocks.realpath }));
vi.mock("vite", () => ({ createServer: mocks.vite }));

type Server = Awaited<ReturnType<typeof startLocalServer>>;
const servers: Server[] = [];
let sequence = 0;
function runtime(mode = "demo") {
	return {
		mode,
		instanceId: `${mode}-${++sequence}`,
		url: `http://127.0.0.1:${43000 + sequence}`,
		token: vi.fn().mockResolvedValue("signed-fixture-jwt"),
		stop: vi.fn().mockResolvedValue(undefined),
	};
}
async function start(options: Parameters<typeof startLocalServer>[0] = {}) {
	const server = await startLocalServer({ port: 0, built: true, ...options });
	servers.push(server);
	return server;
}
function http(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string | string[] | undefined>;
		body?: string;
		onData?: (chunk: Buffer) => void;
	} = {},
) {
	return new Promise<{
		status: number;
		headers: IncomingHttpHeaders;
		body: string;
		json: () => Descriptor & { error?: string };
	}>((resolve, reject) => {
		const req = request(
			url,
			{ method: options.method ?? "GET", headers: options.headers },
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => {
					chunks.push(chunk);
					options.onData?.(chunk);
				});
				res.on("error", reject);
				res.on("end", () => {
					const body = Buffer.concat(chunks).toString();
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body,
						json: () => JSON.parse(body),
					});
				});
			},
		);
		req.setTimeout(3000, () => req.destroy(new Error("Gateway test request timed out")));
		req.on("error", reject);
		req.end(options.body);
	});
}
function select(
	server: Server,
	mode: string,
	instanceId: string | null = server.descriptor().instanceId,
) {
	return http(`${server.url}/__local/environment/select`, {
		method: "POST",
		headers: { origin: server.url, "X-Xray-Local-Csrf": server.descriptor().csrfToken },
		body: JSON.stringify({ mode, instanceId }),
	});
}
function api(server: Server, path = "/api/me", headers: Record<string, string> = {}) {
	return http(`${server.url}/__local/instances/${server.descriptor().instanceId}${path}`, {
		headers,
	});
}
beforeEach(() => {
	vi.resetAllMocks();
	sequence = 0;
	mocks.start.mockImplementation(async (mode: string) => runtime(mode));
	mocks.exec.mockReturnValue(" production-jwt \n");
	mocks.upstream.mockImplementation(async () => Response.json({ ok: true }));
	vi.stubGlobal("fetch", mocks.upstream);
	mocks.vite.mockResolvedValue({ middlewares: mocks.middleware, close: mocks.viteClose });
	mocks.middleware.mockImplementation((_req, res) => {
		res.end("Vite HTML");
	});
	mocks.realpath.mockImplementation(async (path: string) => path);
	mocks.readFile.mockImplementation(async (path: string) =>
		Buffer.from(
			path.endsWith(".html")
				? "<!doctype html><html><head><title>X-Ray</title></head><body>App</body></html>"
				: "asset-content",
		),
	);
});
afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("local environment descriptor and authorization", () => {
	test("unselected descriptor is direct JSON and accepts only configured enum with matching instance", async () => {
		const server = await start();
		const response = await http(`${server.url}/__local/environment`);
		expect(response.status).toBe(200);
		expect(response.headers["cache-control"]).toBe("no-store");
		expect(response.json()).toEqual({
			local: true,
			mode: null,
			locked: false,
			automated: false,
			instanceId: null,
			csrfToken: expect.any(String),
			ingestBase: null,
		});
		expect(mocks.start).not.toHaveBeenCalled();
		for (const mode of ["invalid", "mock", "http://elsewhere.test"])
			expect((await select(server, mode)).status).toBe(409);
		expect((await select(server, "demo", "foreign")).status).toBe(409);
		const accepted = await select(server, "demo");
		expect(accepted.status).toBe(200);
		expect(accepted.json()).toMatchObject({
			mode: "demo",
			instanceId: "demo-1",
			ingestBase: "http://127.0.0.1:43001",
		});
		expect((await select(server, "demo")).json()).toEqual(accepted.json());
		expect(mocks.start).toHaveBeenCalledOnce();
	});

	test("Host, Origin, cross-site and CSRF checks fail before runtime or credential access", async () => {
		const server = await start();
		for (const headers of [
			{ host: "attacker.test" },
			{ origin: "https://attacker.test" },
			{ "sec-fetch-site": "cross-site" },
		])
			expect((await http(`${server.url}/__local/environment`, { headers })).status).toBe(403);
		for (const headers of [
			{},
			{ origin: server.url },
			{ origin: server.url, "X-Xray-Local-Csrf": "wrong" },
			{ origin: server.url, "X-Xray-Local-Csrf": "x".repeat(server.descriptor().csrfToken.length) },
			{ "X-Xray-Local-Csrf": server.descriptor().csrfToken },
		])
			expect(
				(
					await http(`${server.url}/__local/environment/select`, {
						method: "POST",
						headers,
						body: '{"mode":"demo","instanceId":null}',
					})
				).status,
			).toBe(403);
		expect((await http(`${server.url}/__local/environment/select`)).status).toBe(403);
		expect(
			(
				await http(`${server.url}/__local/environment`, {
					headers: { host: "xray.dev.hexly.ai", origin: "https://xray.dev.hexly.ai" },
				})
			).status,
		).toBe(200);
		const port = new URL(server.url).port;
		expect(
			(
				await http(`${server.url}/__local/environment`, {
					headers: { host: `localhost:${port}`, origin: `http://localhost:${port}` },
				})
			).status,
		).toBe(200);
		expect(mocks.start).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	test("bad and oversized selection bodies fail visibly without selecting an instance", async () => {
		const server = await start();
		for (const body of ["{bad json", "x".repeat(2 * 1024 * 1024 + 1)]) {
			const response = await http(`${server.url}/__local/environment/select`, {
				method: "POST",
				headers: { origin: server.url, "X-Xray-Local-Csrf": server.descriptor().csrfToken },
				body,
			});
			expect(response.status).toBeGreaterThanOrEqual(400);
		}
		expect(server.descriptor().mode).toBeNull();
		expect(mocks.start).not.toHaveBeenCalled();
	});

	test.each([undefined, "demo", "e2e"] as const)(
		"manual startup %s can leave and reenter fresh E2E instances",
		async (mode) => {
			const server = await start({ mode });
			const old = server.runtime;
			const oldId = server.descriptor().instanceId;
			expect((await select(server, "e2e")).json()).toMatchObject({
				mode: "e2e",
				locked: false,
				automated: false,
			});
			if (mode === "demo") expect(old?.stop).toHaveBeenCalledOnce();
			if (mode !== "e2e") {
				expect((await select(server, "e2e", oldId)).status).toBe(409);
				expect((await http(`${server.url}/__local/instances/${oldId}/api/me`)).status).toBe(409);
			}
			for (const target of ["demo", "prod"]) {
				const current = server.runtime;
				const currentId = server.descriptor().instanceId;
				expect((await select(server, target)).json()).toMatchObject({
					mode: target,
					locked: false,
				});
				expect(current?.stop).toHaveBeenCalledOnce();
				expect((await http(`${server.url}/__local/instances/${currentId}/api/me`)).status).toBe(
					409,
				);
				const next = await select(server, "e2e");
				expect(next.json()).toMatchObject({ mode: "e2e", locked: false });
				expect(next.json().instanceId).not.toBe(currentId);
			}
			expect(mocks.exec).not.toHaveBeenCalled();
		},
	);

	test.each([false, true])("automated E2E stays locked with hosted=%s", async (hosted) => {
		await expect(start({ automated: true })).rejects.toThrow("require E2E");
		await expect(start({ automated: true, mode: "prod" })).rejects.toThrow("require E2E");
		const server = await start({ mode: "e2e", automated: true, hosted, catalog: "empty" });
		expect((await http(`${server.url}/__local/environment`)).json()).toMatchObject({
			local: !hosted,
			automated: true,
			locked: true,
			mode: "e2e",
		});
		expect(mocks.start).toHaveBeenCalledWith("e2e", { catalog: "empty" });
		for (const mode of ["demo", "prod"]) expect((await select(server, mode)).status).toBe(409);
		expect((await select(server, "e2e")).status).toBe(200);
		expect((await api(server)).status).toBe(200);
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	test("concurrent selections cannot race, failed runtime startup leaves original target usable", async () => {
		const server = await start({ mode: "demo" });
		const old = server.descriptor();
		mocks.start.mockRejectedValueOnce(new Error("Runtime failed"));
		expect((await select(server, "e2e")).status).toBe(503);
		expect(server.descriptor()).toEqual(old);
		let finish!: (value: ReturnType<typeof runtime>) => void;
		mocks.start.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const switching = select(server, "e2e");
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		expect((await select(server, "prod")).status).toBe(503);
		finish(runtime("e2e"));
		expect((await switching).status).toBe(200);
	});

	test.each([false, true])(
		"failed old cleanup preserves target and tracks candidate cleanup failure=%s",
		async (candidateFails) => {
			const previous = runtime("demo");
			const candidate = runtime("e2e");
			mocks.start.mockResolvedValueOnce(previous).mockResolvedValueOnce(candidate);
			const server = await start({ mode: "demo" });
			const original = server.descriptor();
			let rejectStop!: (reason: Error) => void;
			previous.stop.mockImplementationOnce(
				() =>
					new Promise((_resolve, reject) => {
						rejectStop = reject;
					}),
			);
			if (candidateFails)
				candidate.stop.mockRejectedValueOnce(new Error("Candidate cleanup failed"));
			const switching = select(server, "e2e");
			await vi.waitFor(() => expect(rejectStop).toBeTypeOf("function"));
			try {
				expect((await http(`${server.url}/__local/environment`)).json()).toEqual(original);
				expect(server.runtime).toBe(previous);
			} finally {
				rejectStop(new Error("D1 ownership marker mismatch"));
			}
			expect((await switching).status).toBe(503);
			expect(server.descriptor()).toEqual(original);
			expect(server.runtime).toBe(previous);
			expect(candidate.stop).toHaveBeenCalledOnce();
			await server.close();
			expect(previous.stop).toHaveBeenCalledTimes(2);
			expect(candidate.stop).toHaveBeenCalledTimes(candidateFails ? 2 : 1);
			expect(server.runtime).toBeUndefined();
			expect(mocks.exec).not.toHaveBeenCalled();
		},
	);
});

describe("fixed instance API transport", () => {
	test("forwards request method, body and query with signed identity, strips browser credentials and response cookies", async () => {
		const server = await start({ mode: "demo" });
		mocks.upstream.mockResolvedValueOnce(
			new Response("saved", {
				status: 201,
				headers: { "set-cookie": "secret=private", "content-length": "5", "x-result": "accepted" },
			}),
		);
		const response = await http(
			`${server.url}/__local/instances/${server.descriptor().instanceId}/api/channels?q=review`,
			{
				method: "POST",
				headers: {
					origin: server.url,
					cookie: "private-browser",
					authorization: "Bearer client-token",
					"cf-access-jwt-assertion": "client-jwt",
					"x-test-tenant": "other",
					"x-xray-local-csrf": "leak",
					"x-list": ["one", "two"],
					"content-type": "application/json",
				},
				body: '{"name":"Research"}',
			},
		);
		expect(response.status).toBe(201);
		expect(response.body).toBe("saved");
		expect(response.headers["set-cookie"]).toBeUndefined();
		expect(response.headers["x-result"]).toBe("accepted");
		expect(response.headers["cache-control"]).toBe("no-store");
		const [url, init] = mocks.upstream.mock.lastCall as [string, RequestInit];
		expect(url).toBe("http://127.0.0.1:43001/api/channels?q=review");
		expect(init.method).toBe("POST");
		expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{"name":"Research"}');
		const headers = new Headers(init.headers);
		expect(headers.get("cf-access-jwt-assertion")).toBe("signed-fixture-jwt");
		for (const name of ["cookie", "authorization", "x-test-tenant", "x-xray-local-csrf"])
			expect(headers.has(name)).toBe(false);
		expect(headers.get("x-list")).toBe("one, two");
	});

	test("pending Demo mutation never acquires a later Prod target or credentials", async () => {
		const server = await start({ mode: "demo" });
		const old = server.runtime;
		let issue!: (token: string) => void;
		if (!old) throw new Error("Missing runtime");
		vi.mocked(old.token).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					issue = resolve;
				}),
		);
		const pending = http(
			`${server.url}/__local/instances/${server.descriptor().instanceId}/api/channels`,
			{ method: "POST", body: '{"name":"Original draft"}' },
		);
		await vi.waitFor(() => expect(issue).toBeTypeOf("function"));
		expect((await select(server, "prod")).status).toBe(200);
		issue("original-signed-jwt");
		expect((await pending).status).toBe(200);
		expect(mocks.upstream.mock.lastCall?.[0]).toBe("http://127.0.0.1:43001/api/channels");
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	test("unknown API routes and retired routing never bypass the instance", async () => {
		const server = await start();
		for (const path of ["/api/me", "/__product/api/me", "/__local/other"])
			expect((await http(server.url + path)).status).toBe(404);
		expect((await http(`${server.url}/__local/instances/absent/api/me`)).status).toBe(409);
		expect(mocks.upstream).not.toHaveBeenCalled();
	});

	test("upstream failure is visible; empty responses and HEAD preserve semantics", async () => {
		const server = await start({ mode: "demo" });
		mocks.upstream.mockRejectedValueOnce(new Error("Offline"));
		expect((await api(server)).json().error).toBe("Offline");
		mocks.upstream.mockRejectedValueOnce("Offline");
		expect((await api(server)).json().error).toBe("Local environment unavailable");
		mocks.upstream.mockResolvedValueOnce(new Response(null, { status: 204 }));
		expect((await api(server)).status).toBe(204);
		mocks.upstream.mockResolvedValueOnce(new Response(null, { status: 200 }));
		await http(`${server.url}/__local/instances/${server.descriptor().instanceId}/api/me`, {
			method: "HEAD",
		});
		expect(mocks.upstream.mock.lastCall?.[1]).toMatchObject({ method: "HEAD", body: undefined });
	});

	test("an upstream stream failure aborts only that response and leaves the gateway usable", async () => {
		const server = await start({ mode: "demo" });
		let controller!: ReadableStreamDefaultController<Uint8Array>;
		const stream = new ReadableStream<Uint8Array>({
			start(value) {
				controller = value;
				controller.enqueue(new TextEncoder().encode("partial"));
			},
		});
		mocks.upstream.mockResolvedValueOnce(new Response(stream));
		let received = "";
		const response = http(
			`${server.url}/__local/instances/${server.descriptor().instanceId}/api/media/proxy`,
			{
				onData(chunk) {
					received += chunk.toString();
					controller.error(new Error("Upstream interrupted after headers"));
				},
			},
		);
		await expect(response).rejects.toThrow();
		expect(received).toBe("partial");
		expect((await api(server)).status).toBe(200);
		expect(mocks.exec).not.toHaveBeenCalled();
	});
});

describe("mocked production credential boundary", () => {
	test("missing or failed cloudflared token never reaches upstream", async () => {
		const server = await start({ mode: "prod" });
		expect(server.descriptor().ingestBase).toBe("https://xray-ingest.worker.hexly.ai");
		mocks.exec.mockImplementationOnce(() => {
			throw new Error("Sign-in required");
		});
		expect((await api(server)).status).toBe(401);
		mocks.exec.mockReturnValueOnce("\n");
		expect((await api(server)).status).toBe(401);
		expect(mocks.upstream).not.toHaveBeenCalled();
		expect(mocks.start).not.toHaveBeenCalled();
	});

	test("production proxy authenticates server-side, caches credentials, and refreshes after auth failure", async () => {
		const server = await start({ mode: "prod" });
		await api(server, "/api/me", { cookie: "attacker", authorization: "Bearer attacker" });
		await api(server);
		expect(mocks.exec).toHaveBeenCalledOnce();
		const [url, init] = mocks.upstream.mock.lastCall as [string, RequestInit];
		expect(url).toBe("https://xray.hexly.ai/api/me");
		const headers = new Headers(init.headers);
		expect(headers.get("cookie")).toBe("CF_Authorization=production-jwt");
		expect(headers.get("origin")).toBe("https://xray.hexly.ai");
		expect(headers.get("sec-fetch-site")).toBe("same-origin");
		expect(headers.has("authorization")).toBe(false);
		mocks.upstream.mockResolvedValueOnce(Response.json({ error: "Expired" }, { status: 403 }));
		expect((await api(server)).status).toBe(403);
		await api(server);
		expect(mocks.exec).toHaveBeenCalledTimes(2);
	});

	test.each([
		() => new Response(null, { status: 302, headers: { location: "https://access.test/login" } }),
		() => new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }),
	])(
		"Access redirects and HTML become sign-in errors, never browser cookies or pages",
		async (response) => {
			const server = await start({ mode: "prod" });
			mocks.upstream.mockResolvedValueOnce(response());
			const result = await api(server);
			expect(result.status).toBe(401);
			expect(result.headers.location).toBeUndefined();
			expect(result.body).toContain("sign-in required");
			await api(server);
			expect(mocks.exec).toHaveBeenCalledTimes(2);
		},
	);
});

describe("local assets and lifecycle", () => {
	test("built HTML receives capability marker, assets preserve bytes, CI gets hidden descriptor", async () => {
		const server = await start({ mode: "e2e", automated: true, hosted: true });
		const html = await http(`${server.url}/channels/1`);
		expect(html.status).toBe(200);
		expect(html.body).toContain("<head><script>window.__XRAY_LOCAL__=true</script>");
		expect(server.descriptor().local).toBe(false);
		const asset = await http(`${server.url}/assets/app.js`);
		expect(asset.body).toBe("asset-content");
		expect(asset.body).not.toContain("__XRAY_LOCAL__");
	});

	test("development middleware injects marker independently of Vite build mode and closes owned resources", async () => {
		const server = await start({ mode: "demo", built: false });
		expect((await http(`${server.url}/`)).body).toBe("Vite HTML");
		const config = mocks.vite.mock.calls[0]?.[0];
		expect(config.plugins[0].transformIndexHtml()).toEqual([
			{ tag: "script", children: "window.__XRAY_LOCAL__=true", injectTo: "head-prepend" },
		]);
		const owned = server.runtime;
		await server.close();
		expect(owned?.stop).toHaveBeenCalledOnce();
		expect(mocks.viteClose).toHaveBeenCalledOnce();
		expect(server.runtime).toBeUndefined();
	});

	test("failed startup closes the runtime and propagates the error", async () => {
		const owned = runtime();
		mocks.start.mockResolvedValueOnce(owned);
		mocks.vite.mockRejectedValueOnce(new Error("Vite failed"));
		await expect(start({ mode: "demo", built: false })).rejects.toThrow("Vite failed");
		expect(owned.stop).toHaveBeenCalledOnce();
	});

	test("shutdown waits for an in-flight selection and stops every late-created runtime", async () => {
		const previous = runtime("demo");
		const candidate = runtime("e2e");
		mocks.start.mockResolvedValueOnce(previous);
		const server = await start({ mode: "demo" });
		let finish!: (value: ReturnType<typeof runtime>) => void;
		mocks.start.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const switching = select(server, "e2e").catch(() => undefined);
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		const closing = server.close();
		try {
			expect(await Promise.race([closing.then(() => "closed"), delay(25, "pending")])).toBe(
				"pending",
			);
		} finally {
			finish(candidate);
			await closing;
			await switching;
		}
		expect(previous.stop).toHaveBeenCalledOnce();
		expect(candidate.stop).toHaveBeenCalledOnce();
		expect(server.runtime).toBeUndefined();
		expect(server.descriptor().instanceId).toBeNull();
		expect(mocks.exec).not.toHaveBeenCalled();
	});
});

test.each([undefined, "prod"] as const)(
	"built home initializes capability before selecting %s without runtime or credentials",
	async (mode) => {
		const server = await start({ mode });
		const result = await http(`${server.url}/`);
		expect(result.status).toBe(200);
		expect(result.body).toContain("window.__XRAY_LOCAL__=true");
		expect(mocks.start).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
		expect(mocks.upstream).not.toHaveBeenCalled();
	},
);

test("built deep links fall back to index, HEAD omits body and static methods are limited", async () => {
	const server = await start();
	mocks.realpath
		.mockResolvedValueOnce("/virtual/xray/packages/worker/static")
		.mockRejectedValueOnce(new Error("Not found"));
	expect((await http(`${server.url}/channels/3`)).body).toContain("window.__XRAY_LOCAL__=true");
	expect((await http(`${server.url}/`, { method: "HEAD" })).body).toBe("");
	expect((await http(`${server.url}/asset.bin`)).headers["content-type"]).toBe(
		"application/octet-stream",
	);
	expect((await http(`${server.url}/`, { method: "POST", body: "x" })).status).toBe(405);
});

test("built traversal, symlinks and missing build failures never expose foreign files", async () => {
	const server = await start();
	expect((await http(`${server.url}/%2e%2e%2fsecret`)).status).toBe(404);
	mocks.realpath
		.mockResolvedValueOnce("/virtual/xray/packages/worker/static")
		.mockResolvedValueOnce("/private/secret.js");
	expect((await http(`${server.url}/assets/escape.js`)).status).toBe(404);
	expect(mocks.readFile).not.toHaveBeenCalled();
	mocks.realpath.mockRejectedValueOnce(new Error("Build missing"));
	expect((await http(`${server.url}/`)).json().error).toBe("Build missing");
});

test("CSRF compares byte lengths and upstream requests use bounded manual redirects", async () => {
	const server = await start({ mode: "demo" });
	const invalid = "é".repeat(server.descriptor().csrfToken.length);
	const result = await http(`${server.url}/__local/environment/select`, {
		method: "POST",
		headers: { origin: server.url, "X-Xray-Local-Csrf": invalid },
		body: '{"mode":"prod","instanceId":"demo-1"}',
	});
	expect(result.status).toBe(403);
	const timeout = vi.spyOn(AbortSignal, "timeout");
	await api(server);
	expect(timeout).toHaveBeenCalledWith(180_000);
	expect(mocks.upstream.mock.lastCall?.[1]).toMatchObject({
		redirect: "manual",
		signal: expect.any(AbortSignal),
	});
});
