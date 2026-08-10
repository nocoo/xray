export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function parseError(res: Response): Promise<string> {
	let msg = res.statusText;
	try {
		const body = (await res.json()) as { error?: string };
		if (body.error) msg = body.error;
	} catch {
		/* ignore */
	}
	if (res.status === 502 || res.status === 503 || res.status === 504) {
		msg = `Worker unreachable (${res.status}). Start with bun run dev (UI :7007 + worker :8787)`;
	}
	return msg;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			credentials: "same-origin",
			headers: {
				Accept: "application/json",
				...(init?.body ? { "Content-Type": "application/json" } : {}),
				...init?.headers,
			},
			...init,
		});
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		throw new ApiError(
			0,
			`Cannot reach API (${detail}). Is the worker running on :8787? Try bun run dev`,
		);
	}
	if (!res.ok) throw new ApiError(res.status, await parseError(res));
	const json = (await res.json()) as { success?: boolean; data?: T; error?: string } & T;
	if (json && typeof json === "object" && "success" in json) {
		if (!json.success) throw new ApiError(res.status, json.error || "request failed");
		return json.data as T;
	}
	return json as T;
}

export function apiGet<T>(path: string): Promise<T> {
	return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
	return request<T>(path, {
		method: "POST",
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
	return request<T>(path, { method: "DELETE" });
}
