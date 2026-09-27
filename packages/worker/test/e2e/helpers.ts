import http from "node:http";
import { expect } from "vitest";

const runtimeBase = process.env.XRAY_L2_BASE;
if (!runtimeBase) throw new Error("L2 requires its managed E2E runtime");
const runtimeUrl = new URL(runtimeBase);
if (
	runtimeUrl.protocol !== "http:" ||
	runtimeUrl.hostname !== "127.0.0.1" ||
	!runtimeUrl.port ||
	runtimeUrl.username ||
	runtimeUrl.password ||
	runtimeUrl.pathname !== "/" ||
	runtimeUrl.search ||
	runtimeUrl.hash
) {
	throw new Error("L2 refuses a nonlocal runtime URL");
}
export const BASE = runtimeUrl.origin;

/** undici fetch forbids Host; use this to exercise dual-host routing. */
export function rawHttp(
	path: string,
	init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; text: string }> {
	const url = new URL(`${BASE}${path}`);
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				hostname: url.hostname,
				port: url.port,
				path: `${url.pathname}${url.search}`,
				method: init.method ?? "GET",
				headers: {
					...(init.body === undefined
						? {}
						: { "content-length": String(Buffer.byteLength(init.body)) }),
					...init.headers,
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (c) => {
					chunks.push(c as Buffer);
				});
				res.on("end", () => {
					resolve({
						status: res.statusCode ?? 0,
						text: Buffer.concat(chunks).toString("utf8"),
					});
				});
			},
		);
		req.setTimeout(15_000, () => req.destroy(new Error("L2 HTTP request timed out")));
		req.on("error", reject);
		if (init.body) req.write(init.body);
		req.end();
	});
}

export function actorHeaders(actor = "a", extra?: Record<string, string>): Record<string, string> {
	if (actor !== "a" && actor !== "b") throw new Error("Unknown L2 actor");
	const jwt = process.env[actor === "a" ? "XRAY_L2_JWT_A" : "XRAY_L2_JWT_B"];
	if (!jwt) throw new Error("L2 requires signed runtime identities");
	return {
		host: "127.0.0.1",
		origin: "http://localhost:7007",
		accept: "application/json",
		"content-type": "application/json",
		"Cf-Access-Jwt-Assertion": jwt,
		...extra,
	};
}

export function browserHeaders(extra?: Record<string, string>): Record<string, string> {
	return actorHeaders("a", extra);
}

export function ingestHeaders(
	token: string,
	extra?: Record<string, string>,
): Record<string, string> {
	return {
		host: "xray-ingest.worker.hexly.ai",
		authorization: `Bearer ${token}`,
		"content-type": "application/json",
		accept: "application/json",
		...extra,
	};
}

export async function jsonFetch<T = unknown>(
	path: string,
	init?: RequestInit & { headers?: Record<string, string> },
): Promise<{ status: number; body: T; res: Response }> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		signal: init?.signal ?? AbortSignal.timeout(15_000),
		headers: {
			...browserHeaders(),
			...(init?.headers ?? {}),
		},
	});
	let body = null as T;
	const text = await res.text();
	if (text) {
		try {
			body = JSON.parse(text) as T;
		} catch {
			body = text as T;
		}
	}
	return { status: res.status, body, res };
}

export function dataOf<T>(body: unknown): T {
	const b = body as { success?: boolean; data?: T };
	if (b && typeof b === "object" && "data" in b) return b.data as T;
	return body as T;
}

export async function createWatchlist(name: string) {
	const { status, body } = await jsonFetch("/api/watchlists", {
		method: "POST",
		body: JSON.stringify({ name }),
	});
	expect([200, 201]).toContain(status);
	return dataOf<{ id: number; name: string }>(body);
}

export async function createGroup(name: string) {
	const { status, body } = await jsonFetch("/api/groups", {
		method: "POST",
		body: JSON.stringify({ name }),
	});
	expect([200, 201]).toContain(status);
	return dataOf<{ id: number; name: string }>(body);
}

export async function mintToken(label: string, scopes?: string[]) {
	const { status, body } = await jsonFetch("/api/push-tokens", {
		method: "POST",
		body: JSON.stringify(scopes ? { label, scopes } : { label }),
	});
	expect([200, 201]).toContain(status);
	return dataOf<{ id: number; token: string; label: string; scopes: string[] }>(body);
}
