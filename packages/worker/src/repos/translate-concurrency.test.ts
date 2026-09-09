import { describe, expect, test } from "vitest";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import {
	claimTranslateItems,
	markTranslateResult,
	runTranslateBatch,
	STALE_PENDING_MS,
	selectTranslateCandidates,
} from "./translate.js";
import * as watchlists from "./watchlists.js";

const config = {
	user_id: "u1",
	provider: "openai" as const,
	model: "m",
	base_url: null,
	api_key_ciphertext: new ArrayBuffer(0),
	api_key_key_version: 1,
	translation_prompt: null,
	summary_prompt: null,
	updated_at_ms: 0,
};

async function seedItem(aiStatus = "not_requested", updatedAtMs = 0) {
	const db = createSqliteD1();
	await db
		.prepare(
			`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
       VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
		)
		.bind(Date.now())
		.run();
	const wl = await watchlists.createWatchlist(db, "u1", {
		name: "W",
		description: null,
		icon: "eye",
		translateEnabled: true,
	});
	const inserted = await db
		.prepare(
			`INSERT INTO items
         (user_id, watchlist_id, source_type, external_id, text, created_at_ms, ingested_at_ms,
          payload_json, ai_status, ai_status_updated_at_ms)
       VALUES ('u1', ?, 'custom', 'e1', 'hello', ?, ?, '{}', ?, ?)
       RETURNING id`,
		)
		.bind(wl.id, Date.now(), Date.now(), aiStatus, updatedAtMs)
		.first<{ id: number }>();
	if (!inserted) throw new Error("seed item failed");
	return { db, wlId: wl.id, itemId: inserted.id };
}

async function itemRow(db: D1Database, id: number) {
	return db
		.prepare(`SELECT ai_status, translated_text, translation_error FROM items WHERE id = ?`)
		.bind(id)
		.first<{
			ai_status: string;
			translated_text: string | null;
			translation_error: string | null;
		}>();
}

describe("translate claim ownership", () => {
	test("overlapping batches translate once and keep succeeded", async () => {
		const { db, wlId, itemId } = await seedItem();
		let calls = 0;
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let started: () => void = () => undefined;
		const firstStarted = new Promise<void>((resolve) => {
			started = resolve;
		});

		const first = runTranslateBatch(db, "u1", wlId, {
			config,
			apiKey: "sk",
			deadlineMs: 60_000,
			translateFn: async () => {
				calls += 1;
				started();
				await gate;
				return { translatedText: "你好", summaryText: null };
			},
		});

		await firstStarted;

		const second = runTranslateBatch(db, "u1", wlId, {
			config,
			apiKey: "sk",
			deadlineMs: 60_000,
			translateFn: async () => {
				calls += 1;
				throw new Error("second fail");
			},
		});

		const secondOut = await second;
		expect(secondOut.results).toEqual([]);
		release();
		const firstOut = await first;

		expect(calls).toBe(1);
		expect(firstOut.results[0]?.ai_status).toBe("succeeded");
		const row = await itemRow(db, itemId);
		expect(row?.ai_status).toBe("succeeded");
		expect(row?.translated_text).toBe("你好");
	});

	test("second claim of the same ids returns empty", async () => {
		const { db, itemId } = await seedItem();
		const first = await claimTranslateItems(db, "u1", [itemId], 10);
		const second = await claimTranslateItems(db, "u1", [itemId], 11);
		expect(first).toEqual([{ id: itemId, text: "hello" }]);
		expect(second).toEqual([]);
	});

	test("failed result does not overwrite another claim's success", async () => {
		const { db, itemId } = await seedItem();
		await claimTranslateItems(db, "u1", [itemId], 10);
		await markTranslateResult(
			db,
			"u1",
			itemId,
			{ ok: true, translatedText: "你好", summaryText: null },
			20,
			10,
		);
		await markTranslateResult(db, "u1", itemId, { ok: false, error: "late fail" }, 30, 11);
		const row = await itemRow(db, itemId);
		expect(row?.ai_status).toBe("succeeded");
		expect(row?.translated_text).toBe("你好");
		expect(row?.translation_error).toBeNull();
	});

	test("batch translates newest items first", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await watchlists.createWatchlist(db, "u1", {
			name: "W",
			description: null,
			icon: "eye",
			translateEnabled: true,
		});
		await db
			.prepare(
				`INSERT INTO items
         (user_id, watchlist_id, source_type, external_id, text, created_at_ms, ingested_at_ms,
          payload_json, ai_status, ai_status_updated_at_ms)
       VALUES ('u1', ?, 'custom', 'old', 'old', 1, 1, '{}', 'not_requested', 0)`,
			)
			.bind(wl.id)
			.run();
		await db
			.prepare(
				`INSERT INTO items
         (user_id, watchlist_id, source_type, external_id, text, created_at_ms, ingested_at_ms,
          payload_json, ai_status, ai_status_updated_at_ms)
       VALUES ('u1', ?, 'custom', 'new', 'new', 2, 2, '{}', 'not_requested', 0)`,
			)
			.bind(wl.id)
			.run();

		const seen: string[] = [];
		const out = await runTranslateBatch(db, "u1", wl.id, {
			config,
			apiKey: "sk",
			deadlineMs: 60_000,
			translateFn: async ({ text }) => {
				seen.push(text);
				if (seen.length > 1) {
					throw new Error("The operation was aborted");
				}
				return { translatedText: `译:${text}`, summaryText: null };
			},
		});

		expect(seen).toEqual(["new", "old"]);
		expect(out.results[0]).toMatchObject({ ai_status: "succeeded", translatedText: "译:new" });
		expect(out.results[1]?.error).toBe("timed_out");
		const rows = await db
			.prepare(
				`SELECT text, ai_status, translated_text FROM items WHERE watchlist_id = ? ORDER BY created_at_ms DESC`,
			)
			.bind(wl.id)
			.all<{ text: string; ai_status: string; translated_text: string | null }>();
		expect(rows.results[0]).toMatchObject({
			text: "new",
			ai_status: "succeeded",
			translated_text: "译:new",
		});
	});

	test("fresh pending is skipped; stale pending is retried", async () => {
		const fresh = await seedItem("pending", Date.now());
		expect(await selectTranslateCandidates(fresh.db, "u1", fresh.wlId, { limit: 5 })).toEqual([]);
		const skipped = await runTranslateBatch(fresh.db, "u1", fresh.wlId, {
			config,
			apiKey: "sk",
			translateFn: async () => {
				throw new Error("should not translate fresh pending");
			},
		});
		expect(skipped.results).toEqual([]);

		const staleNow = Date.now();
		const stale = await seedItem("pending", staleNow - STALE_PENDING_MS - 1);
		let called = false;
		const retried = await runTranslateBatch(stale.db, "u1", stale.wlId, {
			config,
			apiKey: "sk",
			nowMs: staleNow,
			translateFn: async () => {
				called = true;
				return { translatedText: "再译", summaryText: null };
			},
		});
		expect(called).toBe(true);
		expect(retried.results[0]?.ai_status).toBe("succeeded");
	});
});
