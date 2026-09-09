import { translateAndSummarize } from "../lib/ai-client.js";
import type { TranslateFn } from "../types.js";
import type { AiConfigRow } from "./ai-configs.js";

export const TRANSLATE_MAX = 20;
export const TRANSLATE_DEADLINE_MS = 25_000;
export const STALE_PENDING_MS = 5 * 60_000;

export type TranslateItemResult = {
	id: number;
	ai_status: "succeeded" | "failed" | "not_requested" | "pending";
	error?: string;
	translatedText?: string | null;
	summaryText?: string | null;
};

export type { TranslateFn };

/** Default translator via worker AI client (OpenAI-compatible / next-ai-style). */
export const defaultTranslateFn: TranslateFn = async ({
	text,
	apiKey,
	model,
	baseUrl,
	translationPrompt,
	summaryPrompt,
	signal,
}) => {
	const out = await translateAndSummarize({
		text,
		apiKey,
		model,
		baseUrl,
		translationPrompt,
		summaryPrompt,
		signal,
	});
	return { translatedText: out.translatedText, summaryText: out.summaryText };
};

export async function resetStalePending(
	db: D1Database,
	userId: string,
	watchlistId: number,
	nowMs: number,
): Promise<number> {
	const cutoff = nowMs - STALE_PENDING_MS;
	const result = await db
		.prepare(
			`UPDATE items
       SET ai_status = 'not_requested', ai_status_updated_at_ms = ?
       WHERE user_id = ? AND watchlist_id = ?
         AND ai_status = 'pending'
         AND ai_status_updated_at_ms < ?`,
		)
		.bind(nowMs, userId, watchlistId, cutoff)
		.run();
	return result.meta.changes ?? 0;
}

/** Snapshot of succeeded/pending rows for explicit item_ids (one query). */
export async function loadExistingTranslations(
	db: D1Database,
	userId: string,
	watchlistId: number,
	itemIds: number[],
): Promise<TranslateItemResult[]> {
	const ids = itemIds.filter((n) => Number.isInteger(n) && n > 0).slice(0, TRANSLATE_MAX);
	if (!ids.length) return [];
	const ph = ids.map(() => "?").join(",");
	const { results } = await db
		.prepare(
			`SELECT id, ai_status, translated_text, summary_text FROM items
       WHERE user_id = ? AND watchlist_id = ?
         AND id IN (${ph})
         AND ai_status IN ('succeeded', 'pending')`,
		)
		.bind(userId, watchlistId, ...ids)
		.all<{
			id: number;
			ai_status: string;
			translated_text: string | null;
			summary_text: string | null;
		}>();
	const out: TranslateItemResult[] = [];
	for (const r of results ?? []) {
		if (r.ai_status === "pending") {
			out.push({ id: r.id, ai_status: "pending" });
			continue;
		}
		if (r.ai_status === "succeeded" && r.translated_text) {
			out.push({
				id: r.id,
				ai_status: "succeeded",
				translatedText: r.translated_text,
				summaryText: r.summary_text,
			});
		}
	}
	return out;
}

export async function selectTranslateCandidates(
	db: D1Database,
	userId: string,
	watchlistId: number,
	opts: { limit: number; itemIds?: number[] },
): Promise<Array<{ id: number; text: string }>> {
	const limit = Math.min(TRANSLATE_MAX, Math.max(1, opts.limit));
	if (opts.itemIds?.length) {
		const ids = opts.itemIds.filter((n) => Number.isInteger(n) && n > 0).slice(0, limit);
		if (!ids.length) return [];
		const ph = ids.map(() => "?").join(",");
		const { results } = await db
			.prepare(
				`SELECT id, text FROM items
         WHERE user_id = ? AND watchlist_id = ?
           AND id IN (${ph})
           AND ai_status IN ('not_requested', 'failed')
         ORDER BY created_at_ms DESC, id DESC
         LIMIT ?`,
			)
			.bind(userId, watchlistId, ...ids, limit)
			.all<{ id: number; text: string }>();
		return results ?? [];
	}
	const { results } = await db
		.prepare(
			`SELECT id, text FROM items
       WHERE user_id = ? AND watchlist_id = ?
         AND ai_status IN ('not_requested', 'failed')
       ORDER BY created_at_ms DESC, id DESC
       LIMIT ?`,
		)
		.bind(userId, watchlistId, limit)
		.all<{ id: number; text: string }>();
	return results ?? [];
}

export async function claimTranslateItems(
	db: D1Database,
	userId: string,
	ids: number[],
	claimMs: number,
): Promise<Array<{ id: number; text: string }>> {
	if (!ids.length) return [];
	const ph = ids.map(() => "?").join(",");
	const { results } = await db
		.prepare(
			`UPDATE items
       SET ai_status = 'pending', ai_status_updated_at_ms = ?
       WHERE user_id = ? AND id IN (${ph})
         AND ai_status IN ('not_requested', 'failed')
       RETURNING id, text`,
		)
		.bind(claimMs, userId, ...ids)
		.all<{ id: number; text: string }>();
	const claimed = results ?? [];
	const order = new Map(ids.map((id, i) => [id, i]));
	claimed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
	return claimed;
}

export async function markTranslateResult(
	db: D1Database,
	userId: string,
	id: number,
	result:
		| { ok: true; translatedText: string; summaryText?: string | null }
		| { ok: false; error: string },
	nowMs: number,
	claimMs: number,
): Promise<void> {
	if (result.ok) {
		await db
			.prepare(
				`UPDATE items
         SET ai_status = 'succeeded',
             ai_status_updated_at_ms = ?,
             translated_text = ?,
             summary_text = ?,
             translation_error = NULL
         WHERE user_id = ? AND id = ?
           AND ai_status = 'pending'
           AND ai_status_updated_at_ms = ?`,
			)
			.bind(nowMs, result.translatedText, result.summaryText ?? null, userId, id, claimMs)
			.run();
		return;
	}
	await db
		.prepare(
			`UPDATE items
       SET ai_status = 'failed',
           ai_status_updated_at_ms = ?,
           translation_error = ?
       WHERE user_id = ? AND id = ?
         AND ai_status = 'pending'
         AND ai_status_updated_at_ms = ?`,
		)
		.bind(nowMs, result.error.slice(0, 500), userId, id, claimMs)
		.run();
}

export async function runTranslateBatch(
	db: D1Database,
	userId: string,
	watchlistId: number,
	opts: {
		limit?: number;
		itemIds?: number[];
		config: AiConfigRow;
		apiKey: string;
		translateFn?: TranslateFn;
		nowMs?: number;
		deadlineMs?: number;
	},
): Promise<{ results: TranslateItemResult[]; timed_out: boolean }> {
	const nowMs = opts.nowMs ?? Date.now();
	const deadlineMs = opts.deadlineMs ?? TRANSLATE_DEADLINE_MS;
	const deadlineAt = nowMs + deadlineMs;
	const translateFn = opts.translateFn ?? defaultTranslateFn;

	await resetStalePending(db, userId, watchlistId, nowMs);

	const candidates = await selectTranslateCandidates(db, userId, watchlistId, {
		limit: opts.limit ?? TRANSLATE_MAX,
		itemIds: opts.itemIds,
	});
	const claimed = await claimTranslateItems(
		db,
		userId,
		candidates.map((c) => c.id),
		nowMs,
	);
	if (!claimed.length) {
		if (opts.itemIds?.length) {
			const existing = await loadExistingTranslations(db, userId, watchlistId, opts.itemIds);
			return { results: existing, timed_out: false };
		}
		return { results: [], timed_out: false };
	}

	const results: TranslateItemResult[] = [];
	let timedOut = false;
	const controller = new AbortController();

	for (const item of claimed) {
		const remaining = deadlineAt - Date.now();
		if (remaining <= 0) {
			timedOut = true;
			await db
				.prepare(
					`UPDATE items SET ai_status = 'not_requested', ai_status_updated_at_ms = ?
           WHERE user_id = ? AND id = ? AND ai_status = 'pending'
             AND ai_status_updated_at_ms = ?`,
				)
				.bind(Date.now(), userId, item.id, nowMs)
				.run();
			results.push({ id: item.id, ai_status: "not_requested", error: "timed_out" });
			continue;
		}
		const t = setTimeout(() => controller.abort(), remaining);
		try {
			const out = await translateFn({
				text: item.text,
				apiKey: opts.apiKey,
				provider: opts.config.provider,
				model: opts.config.model,
				baseUrl: opts.config.base_url,
				translationPrompt: opts.config.translation_prompt,
				summaryPrompt: opts.config.summary_prompt,
				signal: controller.signal,
			});
			const doneAt = Date.now();
			await markTranslateResult(
				db,
				userId,
				item.id,
				{ ok: true, translatedText: out.translatedText, summaryText: out.summaryText },
				doneAt,
				nowMs,
			);
			results.push({
				id: item.id,
				ai_status: "succeeded",
				translatedText: out.translatedText,
				summaryText: out.summaryText ?? null,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			const isAbort = /abort/i.test(msg);
			if (isAbort) {
				timedOut = true;
				await db
					.prepare(
						`UPDATE items SET ai_status = 'not_requested', ai_status_updated_at_ms = ?
             WHERE user_id = ? AND id = ? AND ai_status = 'pending'
               AND ai_status_updated_at_ms = ?`,
					)
					.bind(Date.now(), userId, item.id, nowMs)
					.run();
				results.push({ id: item.id, ai_status: "not_requested", error: "timed_out" });
			} else {
				const doneAt = Date.now();
				await markTranslateResult(db, userId, item.id, { ok: false, error: msg }, doneAt, nowMs);
				results.push({ id: item.id, ai_status: "failed", error: msg });
			}
		} finally {
			clearTimeout(t);
		}
	}

	return { results, timed_out: timedOut };
}
