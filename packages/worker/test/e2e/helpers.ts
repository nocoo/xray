import http from "node:http";
import { expect } from "vitest";

export const BASE = process.env.XRAY_L2_BASE || "http://127.0.0.1:18787";

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
				headers: init.headers,
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
		req.on("error", reject);
		if (init.body) req.write(init.body);
		req.end();
	});
}

export function browserHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		host: "127.0.0.1",
		origin: "http://localhost:7007",
		accept: "application/json",
		"content-type": "application/json",
		...extra,
	};
}

export function ingestHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
	return {
		host: "xray-ingest.hexly.ai",
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
