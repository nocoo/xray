import { describe, expect, test } from "vitest";
import { parseCanonicalItem } from "./canonical-item.js";
import type { SpawnFn } from "./producer-spawn.js";
import { createTwitterCliSource, TWITTER_CLI_SOURCE_ID } from "./twitter-cli-source.js";

describe("createTwitterCliSource (adapter boundary)", () => {
	test("id is stable cache namespace", () => {
		const src = createTwitterCliSource({
			spawn: async () => ({ code: 0, stdout: "{}", stderr: "" }),
			bin: "twitter",
			env: {},
			max: 20,
		});
		expect(src.id).toBe(TWITTER_CLI_SOURCE_ID);
	});

	test("fetchHandle returns only canonical items + opaque raw", async () => {
		const envelope = {
			ok: true,
			data: [
				{
					id: "42",
					text: "hello boundary",
					author: { id: "1", name: "A", screenName: "alice" },
					createdAtISO: "2026-08-10T12:00:00+00:00",
					metrics: { likes: 1 },
					media: [],
				},
			],
		};
		const spawn: SpawnFn = async (argv) => {
			expect(argv).toContain("user-posts");
			return { code: 0, stdout: JSON.stringify(envelope), stderr: "" };
		};
		const src = createTwitterCliSource({ spawn, bin: "twitter", env: { PATH: "/bin" }, max: 5 });
		const r = await src.fetchHandle("alice");
		expect(r.raw).toEqual(envelope);
		expect(r.skipped).toEqual([]);
		expect(r.items).toHaveLength(1);
		const item = r.items[0];
		expect(item).toBeDefined();
		if (!item) return;
		// orchestrator-facing: only canonical shape
		expect(item.source_type).toBe("x.com");
		expect(item.external_id).toBe("42");
		expect("screenName" in item).toBe(false);
		expect(parseCanonicalItem(item).ok).toBe(true);
		// round-trip cache
		const again = src.parseCachedRaw(r.raw);
		expect(again.items[0]?.external_id).toBe("42");
	});

	test("ready delegates status preflight", async () => {
		let called = false;
		const spawn: SpawnFn = async (argv) => {
			called = true;
			expect(argv).toContain("status");
			return {
				code: 0,
				stdout: JSON.stringify({ ok: true, data: { authenticated: true } }),
				stderr: "",
			};
		};
		const src = createTwitterCliSource({ spawn, bin: "twitter", env: {}, max: 20 });
		await src.ready();
		expect(called).toBe(true);
	});
});
