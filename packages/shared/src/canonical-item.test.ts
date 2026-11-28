import { describe, expect, test } from "vitest";
import {
	canonicalText,
	canonicalTitle,
	parseCanonicalItem,
	resolveAuthorId,
	resolveAuthorUsername,
} from "./canonical-item.js";

describe("parseCanonicalItem", () => {
	test("accepts valid x.com item with includes", () => {
		const r = parseCanonicalItem({
			source_type: "x.com",
			external_id: "123",
			created_at: "2026-08-10T12:00:00.000Z",
			author: { id: "u1", username: "alice", avatar_url: "https://cdn.example/a.png" },
			meta: { k: 1 },
			body: {
				kind: "x.post",
				tweet: { id: "123", text: "hi", author_id: "u1" },
				includes: { users: [{ id: "u1", name: "Alice", username: "alice" }] },
			},
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(canonicalText(r.value)).toBe("hi");
		expect(canonicalTitle(r.value)).toBeNull();
		expect(resolveAuthorId(r.value)).toBe("u1");
		expect(resolveAuthorUsername(r.value)).toBe("alice");
	});

	test("accepts custom item with tags/title/url", () => {
		const r = parseCanonicalItem({
			source_type: "custom",
			external_id: "c1",
			created_at: "2026-08-10T12:00:00.000Z",
			author: { display_name: "Bot" },
			body: {
				kind: "custom",
				title: "T",
				text: "hello world",
				url: "https://example.com/x",
				tags: ["a", "b"],
			},
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(canonicalText(r.value)).toBe("hello world");
		expect(canonicalTitle(r.value)).toBe("T");
		expect(resolveAuthorId(r.value)).toBeNull();
		expect(resolveAuthorUsername(r.value)).toBe("Bot");
	});

	test("rejects html in custom text", () => {
		const r = parseCanonicalItem({
			source_type: "custom",
			external_id: "c1",
			created_at: "2026-08-10T12:00:00.000Z",
			body: { kind: "custom", text: "<script>x</script>" },
		});
		expect(r.ok).toBe(false);
	});

	test("rejects non-Z created_at", () => {
		const r = parseCanonicalItem({
			source_type: "custom",
			external_id: "c1",
			created_at: "2026-08-10T12:00:00+00:00",
			body: { kind: "custom", text: "ok" },
		});
		expect(r.ok).toBe(false);
	});

	test("rejects bad external_id and source", () => {
		expect(
			parseCanonicalItem({
				source_type: "nope",
				external_id: "1",
				created_at: "2026-08-10T12:00:00Z",
				body: { kind: "custom", text: "x" },
			}).ok,
		).toBe(false);
		expect(
			parseCanonicalItem({
				source_type: "custom",
				external_id: "bad id!",
				created_at: "2026-08-10T12:00:00Z",
				body: { kind: "custom", text: "x" },
			}).ok,
		).toBe(false);
	});

	test("rejects non-https url and oversized meta", () => {
		expect(
			parseCanonicalItem({
				source_type: "custom",
				external_id: "c1",
				created_at: "2026-08-10T12:00:00Z",
				body: { kind: "custom", text: "x", url: "http://insecure.example" },
			}).ok,
		).toBe(false);
		expect(
			parseCanonicalItem({
				source_type: "custom",
				external_id: "c1",
				created_at: "2026-08-10T12:00:00Z",
				meta: { blob: "x".repeat(9000) },
				body: { kind: "custom", text: "x" },
			}).ok,
		).toBe(false);
	});

	test("rejects wrong body kinds", () => {
		expect(
			parseCanonicalItem({
				source_type: "x.com",
				external_id: "1",
				created_at: "2026-08-10T12:00:00Z",
				body: { kind: "custom", text: "x" },
			}).ok,
		).toBe(false);
		expect(
			parseCanonicalItem({
				source_type: "x.com",
				external_id: "1",
				created_at: "2026-08-10T12:00:00Z",
				body: { kind: "x.post", tweet: { id: "1", text: "" } },
			}).ok,
		).toBe(false);
	});

	test("rejects non-object", () => {
		expect(parseCanonicalItem(null).ok).toBe(false);
		expect(parseCanonicalItem("x").ok).toBe(false);
	});

	test("rejects bad entities shape", () => {
		const r = parseCanonicalItem({
			source_type: "x.com",
			external_id: "1",
			created_at: "2026-08-10T12:00:00.000Z",
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", entities: { urls: "nope" } },
			},
		});
		expect(r.ok).toBe(false);
	});

	test("accepts full x.post payload (metrics, entities, attachments, includes) and resolves author", () => {
		const r = parseCanonicalItem({
			source_type: "x.com",
			external_id: "200",
			created_at: "2026-08-10T12:00:00.000Z",
			author: { id: "fallback-u", username: "fallback", display_name: "Alice" },
			body: {
				kind: "x.post",
				tweet: {
					id: "200",
					text: "hello https://t.co/x @bob #ai",
					author_id: "u1",
					created_at: "2026-08-10T12:00:00Z",
					lang: "en",
					possibly_sensitive: false,
					public_metrics: { like_count: 5, retweet_count: 2 },
					entities: {
						urls: [
							{ start: 6, end: 18, url: "https://t.co/x", expanded_url: "https://example.com" },
						],
						mentions: [{ start: 19, end: 23, username: "bob", id: "u2" }],
						hashtags: [{ start: 24, end: 27, tag: "ai" }],
					},
					attachments: { media_keys: ["m1"], poll_ids: ["p1"] },
					referenced_tweets: [{ type: "quoted", id: "199" }],
					note_tweet: { text: "long note" },
					edit_history_tweet_ids: ["200"],
				},
				includes: {
					tweets: [{ id: "199", text: "quoted post", author_id: "u2" }],
					users: [{ id: "u1", name: "Alice", username: "alice_real", verified: true }],
					media: [
						{ media_key: "m1", type: "photo", url: "https://pbs.twimg.com/a.jpg", width: 800 },
					],
				},
			},
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(resolveAuthorId(r.value)).toBe("u1");
		expect(resolveAuthorUsername(r.value)).toBe("alice_real");
	});

	test("rejects insecure avatar/media urls and invalid tags", () => {
		expect(
			parseCanonicalItem({
				source_type: "custom",
				external_id: "c1",
				created_at: "2026-08-10T12:00:00Z",
				author: { avatar_url: "http://insecure.example/a.png" },
				body: { kind: "custom", text: "x" },
			}).ok,
		).toBe(false);
		expect(
			parseCanonicalItem({
				source_type: "x.com",
				external_id: "1",
				created_at: "2026-08-10T12:00:00Z",
				body: {
					kind: "x.post",
					tweet: { id: "1", text: "hi" },
					includes: { media: [{ media_key: "m1", type: "photo", url: "http://insecure/a.jpg" }] },
				},
			}).ok,
		).toBe(false);
		expect(
			parseCanonicalItem({
				source_type: "custom",
				external_id: "c2",
				created_at: "2026-08-10T12:00:00Z",
				body: { kind: "custom", text: "x", tags: [""] },
			}).ok,
		).toBe(false);
	});
});
