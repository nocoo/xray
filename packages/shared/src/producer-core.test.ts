import { describe, expect, test } from "vitest";
import type { CanonicalItem } from "./canonical-item.js";
import { buildIngestBatches, filterItemsByWindow, INGEST_MAX_ITEMS } from "./producer-core.js";

const item = (created_at: string, id = "1"): CanonicalItem => ({
	source_type: "custom",
	external_id: id,
	created_at,
	body: { kind: "custom", text: "t" },
});

describe("producer-core", () => {
	test("filter drops future and old", () => {
		const now = Date.parse("2026-08-10T12:00:00.000Z");
		const r = filterItemsByWindow(
			[
				item("2026-08-10T11:00:00.000Z"),
				item("2026-08-01T12:00:00.000Z"),
				item("2026-08-10T12:10:00.000Z"),
				item("bad"),
			],
			24,
			now,
		);
		expect(r.kept).toHaveLength(1);
		expect(r.dropped).toBe(3);
	});

	test("buildIngestBatches chunks and options", () => {
		expect(buildIngestBatches(1, [])).toEqual([]);
		const many = Array.from({ length: INGEST_MAX_ITEMS + 2 }, (_, i) =>
			item("2026-08-10T12:00:00.000Z", String(i + 1)),
		);
		const batches = buildIngestBatches(9, many, { apply_window_hours: 12 });
		expect(batches).toHaveLength(2);
		expect(batches[0]?.options?.apply_window_hours).toBe(12);
		expect(batches[0]?.items).toHaveLength(INGEST_MAX_ITEMS);
		const plain = buildIngestBatches(1, [item("2026-08-10T12:00:00.000Z")]);
		expect(plain[0]?.options).toBeUndefined();
	});
});
