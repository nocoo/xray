import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseCanonicalItem } from "./canonical-item.js";
import {
	buildIngestBatches,
	filterItemsByWindow,
	INGEST_MAX_ITEMS,
	mapTwitterCliEnvelope,
	mapTwitterCliTweetToCanonical,
	toRfc3339Z,
} from "./twitter-cli-map.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
	readFileSync(join(here, "fixtures/twitter-cli-user-posts.json"), "utf8"),
) as unknown;

describe("toRfc3339Z", () => {
	test("converts +00:00 to Z with ms", () => {
		expect(toRfc3339Z("2026-05-02T22:30:18+00:00")).toBe("2026-05-02T22:30:18.000Z");
	});

	test("parses twitter classic createdAt", () => {
		expect(toRfc3339Z("Sat May 02 22:30:18 +0000 2026")).toBe("2026-05-02T22:30:18.000Z");
	});
});

describe("mapTwitterCliTweetToCanonical", () => {
	test("maps fixture tweets through parseCanonicalItem", () => {
		const env = mapTwitterCliEnvelope(fixture);
		expect(env.envelopeError).toBeUndefined();
		// 2 good, 2 bad in fixture
		expect(env.items.length).toBe(2);
		expect(env.skipped.length).toBe(2);

		for (const item of env.items) {
			const again = parseCanonicalItem(item);
			expect(again.ok).toBe(true);
			if (!again.ok) continue;
			expect(again.value.source_type).toBe("x.com");
			expect(again.value.external_id.length).toBeGreaterThan(0);
			expect(again.value.created_at.endsWith("Z")).toBe(true);
			if (again.value.source_type !== "x.com") continue;
			expect(again.value.body.kind).toBe("x.post");
			expect(again.value.body.tweet.id).toBe(again.value.external_id);
			expect(again.value.body.tweet.text.length).toBeGreaterThan(0);
		}

		const withMedia = env.items.find((i) => i.external_id === "2050704462759747727");
		expect(withMedia).toBeDefined();
		if (withMedia?.source_type === "x.com") {
			expect(withMedia.body.includes?.media?.[0]?.type).toBe("photo");
			expect(withMedia.body.tweet.attachments?.media_keys).toEqual(["m0"]);
			expect(withMedia.author?.username).toBe("zhengli");
		}

		const quoted = env.items.find((i) => i.external_id === "999001");
		expect(quoted?.source_type).toBe("x.com");
		if (quoted?.source_type === "x.com") {
			expect(quoted.body.tweet.referenced_tweets).toEqual([{ type: "quoted", id: "888" }]);
			expect(quoted.body.tweet.public_metrics?.like_count).toBe(10);
			// http avatar upgraded
			expect(quoted.author?.avatar_url?.startsWith("https://")).toBe(true);
			expect(quoted.author?.username).toBe("alice");
		}
	});

	test("skips empty text without throwing", () => {
		const r = mapTwitterCliTweetToCanonical({
			id: "1",
			text: "   ",
			createdAtISO: "2026-08-10T12:00:00Z",
		});
		expect(r.ok).toBe(false);
	});
});

describe("filterItemsByWindow + buildIngestBatches", () => {
	test("window drops old items; batches cap at 50", () => {
		const env = mapTwitterCliEnvelope(fixture);
		const now = Date.parse("2026-08-11T00:00:00.000Z");
		// 24h window keeps only 999001 (2026-08-10), drops May tweet
		const { kept, dropped } = filterItemsByWindow(env.items, 24, now);
		expect(kept.map((k) => k.external_id)).toEqual(["999001"]);
		expect(dropped).toBe(1);

		const base = kept[0];
		expect(base).toBeDefined();
		if (!base) return;
		const many = Array.from({ length: 55 }, (_, i) => {
			return {
				...base,
				external_id: `id-${i}`,
				body: {
					...base.body,
					tweet: {
						...(base.source_type === "x.com" ? base.body.tweet : { id: "", text: "" }),
						id: `id-${i}`,
					},
				},
			} as typeof base;
		});
		const batches = buildIngestBatches(4, many, { apply_window_hours: 24 });
		expect(batches.length).toBe(2);
		const first = batches[0];
		const second = batches[1];
		expect(first?.items.length).toBe(INGEST_MAX_ITEMS);
		expect(second?.items.length).toBe(5);
		expect(first?.watchlist_id).toBe(4);
		expect(first?.options?.apply_window_hours).toBe(24);
		for (const b of batches) {
			for (const it of b.items) {
				expect(parseCanonicalItem(it).ok).toBe(true);
			}
		}
	});
});
