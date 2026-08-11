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

/** Already-succeeded items for explicit item_ids (idempotent per-card translate). */
export async function loadSucceededTranslations(
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
			`SELECT id, translated_text, summary_text FROM items
       WHERE user_id = ? AND watchlist_id = ?
         AND id IN (${ph})
         AND ai_status = 'succeeded'
         AND translated_text IS NOT NULL`,
		)
		.bind(userId, watchlistId, ...ids)
		.all<{ id: number; translated_text: string; summary_text: string | null }>();
	return (results ?? []).map((r) => ({
		id: r.id,
		ai_status: "succeeded" as const,
		translatedText: r.translated_text,
		summaryText: r.summary_text,
	}));
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
           AND ai_status IN ('not_requested', 'failed', 'pending')
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

export async function markPending(
	db: D1Database,
	userId: string,
	ids: number[],
	nowMs: number,
): Promise<void> {
	if (!ids.length) return;
	const ph = ids.map(() => "?").join(",");
	await db
		.prepare(
			`UPDATE items SET ai_status = 'pending', ai_status_updated_at_ms = ?
       WHERE user_id = ? AND id IN (${ph})`,
		)
		.bind(nowMs, userId, ...ids)
		.run();
}

export async function markTranslateResult(
	db: D1Database,
	userId: string,
	id: number,
	result:
		| { ok: true; translatedText: string; summaryText?: string | null }
		| { ok: false; error: string },
	nowMs: number,
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
         WHERE user_id = ? AND id = ?`,
			)
			.bind(nowMs, result.translatedText, result.summaryText ?? null, userId, id)
			.run();
		return;
	}
	await db
		.prepare(
			`UPDATE items
       SET ai_status = 'failed',
           ai_status_updated_at_ms = ?,
           translation_error = ?
       WHERE user_id = ? AND id = ?`,
		)
		.bind(nowMs, result.error.slice(0, 500), userId, id)
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
	if (!candidates.length) {
		// Per-card translate with item_ids: return already-succeeded rows so UI can hydrate.
		if (opts.itemIds?.length) {
			const existing = await loadSucceededTranslations(db, userId, watchlistId, opts.itemIds);
			return { results: existing, timed_out: false };
		}
		return { results: [], timed_out: false };
	}

	await markPending(
		db,
		userId,
		candidates.map((c) => c.id),
		nowMs,
	);

	const results: TranslateItemResult[] = [];
	let timedOut = false;
	const controller = new AbortController();

	for (const item of candidates) {
		const remaining = deadlineAt - Date.now();
		if (remaining <= 0) {
			timedOut = true;
			// revert unfinished pending to not_requested
			await db
				.prepare(
					`UPDATE items SET ai_status = 'not_requested', ai_status_updated_at_ms = ?
           WHERE user_id = ? AND id = ? AND ai_status = 'pending'`,
				)
				.bind(Date.now(), userId, item.id)
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
             WHERE user_id = ? AND id = ? AND ai_status = 'pending'`,
					)
					.bind(Date.now(), userId, item.id)
					.run();
				results.push({ id: item.id, ai_status: "not_requested", error: "timed_out" });
			} else {
				const doneAt = Date.now();
				await markTranslateResult(db, userId, item.id, { ok: false, error: msg }, doneAt);
				results.push({ id: item.id, ai_status: "failed", error: msg });
			}
		} finally {
			clearTimeout(t);
		}
	}

	return { results, timed_out: timedOut };
}
