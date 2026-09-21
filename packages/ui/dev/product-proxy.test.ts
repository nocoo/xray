import { execFileSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { afterEach, expect, test, vi } from "vitest";
import { PRODUCT_ORIGIN, productAccess, productProxy } from "./product-proxy";

vi.mock("node:child_process", () => {
	const execute = vi.fn();
	return { execFileSync: execute, default: { execFileSync: execute } };
});

afterEach(() => vi.resetAllMocks());

function setup() {
	let handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
	const plugin = productAccess();
	if (typeof plugin.configureServer !== "function") throw new Error("Missing middleware");
	plugin.configureServer.call(
		{} as never,
		{
			middlewares: {
				use: (middleware: typeof handler) => {
					handler = middleware;
				},
			},
		} as unknown as ViteDevServer,
	);
	return (
		url: string | undefined,
		headers: IncomingMessage["headers"] = { host: "xray.dev.hexly.ai" },
	) => {
		const req = { url, headers } as IncomingMessage;
		const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn(), once: vi.fn() };
		const next = vi.fn();
		handler(req, res as unknown as ServerResponse, next);
		return { req, res, next };
	};
}

test("local APIs never request a production credential", () => {
	const request = setup();
	expect(request("/api/dashboard").next).toHaveBeenCalled();
	expect(request(undefined).next).toHaveBeenCalled();
	expect(execFileSync).not.toHaveBeenCalled();
});

test.each([
	{},
	{ host: "evil.example" },
	{ host: "xray.dev.hexly.ai", origin: "https://evil.example" },
	{ host: "xray.dev.hexly.ai", "sec-fetch-site": "cross-site" },
])("rejects foreign origins before reading credentials: %j", (headers) => {
	const result = setup()("/__product/api/me", headers);
	expect(result.res.statusCode).toBe(403);
	expect(result.next).not.toHaveBeenCalled();
	expect(execFileSync).not.toHaveBeenCalled();
});

test("missing or unreadable credentials fail closed without forwarding", () => {
	const request = setup();
	vi.mocked(execFileSync).mockImplementationOnce(() => {
		throw new Error("secret diagnostic");
	});
	const failed = request("/__product/api/me");
	expect(failed.res.statusCode).toBe(401);
	expect(failed.res.end).toHaveBeenCalledWith(expect.stringContaining("login:product"));
	expect(failed.res.end).not.toHaveBeenCalledWith(expect.stringContaining("secret diagnostic"));
	expect(failed.next).not.toHaveBeenCalled();
	vi.mocked(execFileSync).mockReturnValueOnce("");
	expect(request("/__product/api/me").res.statusCode).toBe(401);
});

test("forwards only the server credential and caches it briefly", () => {
	vi.mocked(execFileSync).mockReturnValue("test-access-token\n");
	const request = setup();
	const result = request("/__product/api/me", {
		host: "xray.dev.hexly.ai",
		origin: "https://xray.dev.hexly.ai",
		cookie: "unrelated=secret",
		authorization: "Bearer client-token",
		"cf-access-jwt-assertion": "spoofed",
		"x-test-actor": "b",
		accept: "application/json",
	});
	expect(result.next).toHaveBeenCalledOnce();
	expect(result.req.headers).toEqual({
		host: "xray.dev.hexly.ai",
		origin: PRODUCT_ORIGIN,
		cookie: "CF_Authorization=test-access-token",
		"sec-fetch-site": "same-origin",
		accept: "application/json",
	});
	expect(
		request("/__product/api/dashboard", { host: "localhost:7007", origin: "http://localhost:7007" })
			.next,
	).toHaveBeenCalled();
	expect(execFileSync).toHaveBeenCalledTimes(1);
	result.res.once.mock.calls[0]?.[1]();
	result.res.statusCode = 401;
	result.res.once.mock.calls[0]?.[1]();
	const retry = request("/__product/api/me");
	expect(execFileSync).toHaveBeenCalledTimes(2);
	retry.res.statusCode = 403;
	retry.res.once.mock.calls[0]?.[1]();
	request("/__product/api/me");
	expect(execFileSync).toHaveBeenCalledTimes(3);
});

test("proxy pins the production origin and strips cookies and login redirects", () => {
	expect(productProxy.target).toBe(PRODUCT_ORIGIN);
	expect(productProxy.rewrite?.("/__product/api/watchlists?limit=1")).toBe(
		"/api/watchlists?limit=1",
	);
	let onResponse = (_response: { statusCode: number; headers: Record<string, string> }) => {};
	productProxy.configure?.(
		{
			on: (_event: string, handler: typeof onResponse) => {
				onResponse = handler;
			},
		} as never,
		{},
	);
	for (const headers of [
		{ "set-cookie": "private", "content-type": "application/json" },
		{ "set-cookie": "private", location: "https://login.example" },
		{ "content-type": "text/html" },
		{},
	]) {
		const response = { statusCode: 200, headers: { ...headers } as Record<string, string> };
		onResponse(response);
		expect(response.headers["set-cookie"]).toBeUndefined();
		expect(response.headers.location).toBeUndefined();
		expect(response.headers["cache-control"]).toBe("no-store");
		expect(response.statusCode).toBe(
			headers.location || headers["content-type"] === "text/html" ? 401 : 200,
		);
	}
});
