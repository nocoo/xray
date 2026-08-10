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
	const res = await fetch(path, {
		credentials: "same-origin",
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		let msg = res.statusText;
		try {
			const body = (await res.json()) as { error?: string };
			if (body.error) msg = body.error;
		} catch {
			/* ignore */
		}
		throw new ApiError(res.status, msg);
	}
	return (await res.json()) as T;
}
