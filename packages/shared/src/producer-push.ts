import type { CanonicalItem } from "./canonical-item.js";
import { parsePushSuccessBody, pushRetryDelayMs, shouldStopPush } from "./producer-utils.js";
import type { IngestPushBody } from "./twitter-cli-map.js";

export type FetchFn = (
	url: string,
	init: {
		method: string;
		headers: Record<string, string>;
		body: string;
	},
) => Promise<{ status: number; text: () => Promise<string>; ok: boolean }>;

export type PushBatchResult =
	| {
			ok: true;
			status: number;
			accepted: number;
			deduped: number;
			rejected: number;
			itemErrors?: unknown;
	  }
	| {
			ok: false;
			status: number;
			error: string;
			fatal?: boolean;
	  };

export type PushBatchDeps = {
	fetch: FetchFn;
	sleep: (ms: number) => Promise<void>;
	ingestBase: string;
	pushToken: string;
	maxAttempts?: number;
};

export async function pushIngestBatch(
	deps: PushBatchDeps,
	body: {
		watchlist_id: number;
		items: CanonicalItem[];
		options?: { apply_window_hours?: number };
	},
): Promise<PushBatchResult> {
	const maxAttempts = deps.maxAttempts ?? 4;
	const url = `${deps.ingestBase.replace(/\/$/, "")}/api/v1/ingest/push`;
	const headers: Record<string, string> = {
		authorization: `Bearer ${deps.pushToken}`,
		"content-type": "application/json",
	};
	if (deps.ingestBase.includes("127.0.0.1") || deps.ingestBase.includes("localhost")) {
		headers.host = "xray-ingest.hexly.ai";
	}

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let status = 0;
		let text = "";
		try {
			const res = await deps.fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body satisfies IngestPushBody | typeof body),
			});
			status = res.status;
			text = await res.text();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			const delay = pushRetryDelayMs(0, attempt);
			if (delay != null && attempt < maxAttempts) {
				await deps.sleep(delay);
				continue;
			}
			return { ok: false, status: 0, error: msg };
		}

		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			json = null;
		}

		if (shouldStopPush(status)) {
			return {
				ok: false,
				status,
				error:
					typeof (json as { error?: string } | null)?.error === "string"
						? (json as { error: string }).error
						: text.slice(0, 300),
				fatal: true,
			};
		}

		if (status < 200 || status >= 300) {
			const delay = pushRetryDelayMs(status, attempt);
			const errMsg =
				typeof (json as { error?: string } | null)?.error === "string"
					? (json as { error: string }).error
					: text.slice(0, 300);
			if (delay != null && attempt < maxAttempts) {
				await deps.sleep(delay);
				continue;
			}
			return { ok: false, status, error: errMsg };
		}

		const parsed = parsePushSuccessBody(json, body.items.length);
		if (!parsed.ok) return { ok: false, status, error: parsed.reason };
		return {
			ok: true,
			status,
			accepted: parsed.accepted,
			deduped: parsed.deduped,
			rejected: parsed.rejected,
			itemErrors: parsed.errors,
		};
	}
	return { ok: false, status: 0, error: "push exhausted retries" };
}
