export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export async function apiGet<T>(path: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			credentials: "same-origin",
			headers: { Accept: "application/json" },
		});
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		throw new ApiError(
			0,
			`Cannot reach API (${detail}). Is the worker running on :8787? Try bun run dev`,
		);
	}
	if (!res.ok) {
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
		throw new ApiError(res.status, msg);
	}
	return (await res.json()) as T;
}
