import { describe, expect, test } from "vitest";
import {
	canonicalText,
	canonicalTitle,
	parseCanonicalItem,
	resolveAuthorId,
	resolveAuthorUsername,
} from "./canonical-item.js";

const baseX = () => ({
	source_type: "x.com" as const,
	external_id: "123",
	created_at: "2026-08-10T12:00:00.000Z",
	body: {
		kind: "x.post" as const,
		tweet: { id: "123", text: "hi", author_id: "u1" },
	},
});

const baseCustom = () => ({
	source_type: "custom" as const,
	external_id: "c1",
	created_at: "2026-08-10T12:00:00.000Z",
	body: { kind: "custom" as const, text: "hello" },
});

function fail(raw: unknown) {
	const r = parseCanonicalItem(raw);
	expect(r.ok).toBe(false);
	return r;
}

describe("parseCanonicalItem branch matrix", () => {
	test("top-level rejects", () => {
		fail(null);
		fail("x");
		fail({ source_type: "nope", external_id: "1", created_at: "2026-08-10T12:00:00Z", body: {} });
		fail({
			source_type: "custom",
			external_id: "bad id!",
			created_at: "2026-08-10T12:00:00Z",
			body: { kind: "custom", text: "x" },
		});
		fail({
			source_type: "custom",
			external_id: "ok",
			created_at: "not-a-date",
			body: { kind: "custom", text: "x" },
		});
		fail({ source_type: "custom", external_id: "ok", created_at: "2026-08-10T12:00:00Z" });
		fail({
			source_type: "custom",
			external_id: "ok",
			created_at: "2026-08-10T12:00:00Z",
			body: "no",
		});
		fail({
			source_type: "custom",
			external_id: "ok",
			created_at: "2026-08-10T12:00:00Z",
			meta: [],
			body: { kind: "custom", text: "x" },
		});
		fail({
			source_type: "custom",
			external_id: "ok",
			created_at: "2026-08-10T12:00:00Z",
			meta: { huge: "x".repeat(9000) },
			body: { kind: "custom", text: "x" },
		});
	});

	test("author validation", () => {
		fail({ ...baseCustom(), author: [] });
		fail({ ...baseCustom(), author: { id: "" } });
		fail({ ...baseCustom(), author: { id: 1 } });
		fail({ ...baseCustom(), author: { username: 1 } });
		fail({ ...baseCustom(), author: { display_name: 1 } });
		fail({ ...baseCustom(), author: { avatar_url: "http://x" } });
		fail({ ...baseCustom(), author: { avatar_url: "not-url" } });
		const ok = parseCanonicalItem({
			...baseCustom(),
			author: {
				id: " a ",
				username: " u ",
				display_name: " n ",
				avatar_url: "https://cdn.example/a.png",
			},
		});
		expect(ok.ok).toBe(true);
	});

	test("x.com body and tweet fields", () => {
		fail({ ...baseX(), body: { kind: "custom", text: "x" } });
		fail({ ...baseX(), body: { kind: "x.post" } });
		fail({ ...baseX(), body: { kind: "x.post", tweet: null } });
		fail({ ...baseX(), body: { kind: "x.post", tweet: [] } });
		fail({ ...baseX(), body: { kind: "x.post", tweet: { id: "", text: "hi" } } });
		fail({ ...baseX(), body: { kind: "x.post", tweet: { id: "1", text: "" } } });
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "x".repeat(20_001) } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", created_at: "bad" },
			},
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", author_id: 1 } },
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", possibly_sensitive: "yes" } },
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", public_metrics: [] } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", public_metrics: { like_count: "1" } },
			},
		});
		const rich = parseCanonicalItem({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: {
					id: "1",
					text: "hi",
					author_id: "u1",
					created_at: "2026-08-10T12:00:00.000Z",
					conversation_id: "c",
					in_reply_to_user_id: "u2",
					lang: "en",
					possibly_sensitive: false,
					public_metrics: { like_count: 1, reply_count: 2 },
					entities: {
						urls: [
							{
								start: 0,
								end: 1,
								url: "https://t.co/x",
								expanded_url: "https://x.com",
								display_url: "x.com",
							},
						],
						mentions: [{ start: 0, end: 1, username: "a", id: "1" }],
						hashtags: [{ start: 0, end: 1, tag: "t" }],
						cashtags: [{ start: 0, end: 1, tag: "USD" }],
					},
					attachments: { media_keys: ["m1"], poll_ids: ["p1"] },
					referenced_tweets: [{ type: "quoted", id: "9" }],
					note_tweet: { text: "long" },
					edit_history_tweet_ids: ["1", "2"],
				},
				includes: {
					tweets: [{ id: "9", text: "quoted" }],
					users: [
						{
							id: "u1",
							name: "Alice",
							username: "alice",
							profile_image_url: "https://cdn.example/a.png",
							description: "bio",
							verified: true,
							protected: false,
							public_metrics: { followers_count: 1 },
						},
					],
					media: [
						{
							media_key: "m1",
							type: "photo",
							url: "https://cdn.example/m.jpg",
							preview_image_url: "https://cdn.example/p.jpg",
							width: 10,
							height: 10,
							duration_ms: 0,
						},
					],
				},
			},
		});
		expect(rich.ok).toBe(true);
		if (rich.ok) {
			expect(canonicalText(rich.value)).toBe("hi");
			expect(resolveAuthorUsername(rich.value)).toBe("alice");
			expect(resolveAuthorId(rich.value)).toBe("u1");
		}
	});

	test("tweet entities/attachments/refs rejects", () => {
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", entities: [] } },
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", entities: { urls: "x" } } },
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", entities: { urls: [null] } } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", entities: { urls: [{ start: 0 }] } },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", entities: { urls: [{ start: 0, end: 1 }] } },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: {
					id: "1",
					text: "hi",
					entities: { mentions: [{ start: 0, end: 1 }] },
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: {
					id: "1",
					text: "hi",
					entities: { hashtags: [{ start: 0, end: 1 }] },
				},
			},
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", attachments: [] } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", attachments: { media_keys: [1] } },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", attachments: { poll_ids: [1] } },
			},
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", referenced_tweets: {} } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", referenced_tweets: [null] },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", referenced_tweets: [{ type: "nope", id: "1" }] },
			},
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", note_tweet: [] } },
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi", note_tweet: { text: "" } } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi", edit_history_tweet_ids: [1] },
			},
		});
	});

	test("includes validation", () => {
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi" }, includes: [] },
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi" }, includes: { tweets: {} } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { tweets: [{ id: "", text: "x" }] },
			},
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi" }, includes: { users: {} } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { users: [{ id: "1" }] },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					users: [{ id: "1", name: "n", username: "u", profile_image_url: "http://x" }],
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					users: [{ id: "1", name: "n", username: "u", description: 1 }],
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					users: [{ id: "1", name: "n", username: "u", verified: "yes" }],
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					users: [{ id: "1", name: "n", username: "u", protected: "yes" }],
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					users: [{ id: "1", name: "n", username: "u", public_metrics: [] }],
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					users: [
						{
							id: "1",
							name: "n",
							username: "u",
							public_metrics: { followers_count: "1" },
						},
					],
				},
			},
		});
		fail({
			...baseX(),
			body: { kind: "x.post", tweet: { id: "1", text: "hi" }, includes: { media: {} } },
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { media: [{ media_key: 1 }] },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { media: [{ media_key: "m", type: "nope" }] },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { media: [{ media_key: "m", type: "photo", url: "http://x" }] },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: {
					media: [{ media_key: "m", type: "photo", preview_image_url: "bad" }],
				},
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { media: [{ media_key: "m", type: "photo", width: "1" }] },
			},
		});
	});

	test("custom body edges", () => {
		fail({ ...baseCustom(), body: { kind: "x.post", tweet: { id: "1", text: "x" } } });
		fail({ ...baseCustom(), body: { kind: "custom", text: "" } });
		fail({ ...baseCustom(), body: { kind: "custom", text: "x".repeat(20_001) } });
		fail({ ...baseCustom(), body: { kind: "custom", text: "<b>x</b>" } });
		fail({ ...baseCustom(), body: { kind: "custom", text: "ok", title: 1 } });
		fail({
			...baseCustom(),
			body: { kind: "custom", text: "ok", title: "x".repeat(501) },
		});
		fail({ ...baseCustom(), body: { kind: "custom", text: "ok", url: "http://x" } });
		fail({ ...baseCustom(), body: { kind: "custom", text: "ok", tags: "a" } });
		fail({
			...baseCustom(),
			body: { kind: "custom", text: "ok", tags: Array.from({ length: 21 }, () => "t") },
		});
		fail({ ...baseCustom(), body: { kind: "custom", text: "ok", tags: [""] } });
		fail({ ...baseCustom(), body: { kind: "custom", text: "ok", tags: ["x".repeat(65)] } });
		const ok = parseCanonicalItem({
			...baseCustom(),
			body: {
				kind: "custom",
				text: "ok",
				title: "  ",
				url: "https://example.com",
				tags: [" a ", "b"],
			},
		});
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(canonicalTitle(ok.value)).toBeNull();
			expect(resolveAuthorId(ok.value)).toBeNull();
			expect(resolveAuthorUsername(ok.value)).toBeNull();
		}
	});

	test("includes.users/media null item", () => {
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { users: [null] },
			},
		});
		fail({
			...baseX(),
			body: {
				kind: "x.post",
				tweet: { id: "1", text: "hi" },
				includes: { media: [null] },
			},
		});
		// invalid Date.parse path — RFC3339 shape but invalid calendar
		fail({
			source_type: "custom",
			external_id: "ok",
			created_at: "2026-13-40T12:00:00.000Z",
			body: { kind: "custom", text: "x" },
		});
	});

	test("resolve helpers fallbacks", () => {
		const x = parseCanonicalItem({
			...baseX(),
			author: { username: "from-author" },
			body: { kind: "x.post", tweet: { id: "1", text: "hi" } },
		});
		expect(x.ok).toBe(true);
		if (x.ok) {
			expect(resolveAuthorId(x.value)).toBeNull();
			expect(resolveAuthorUsername(x.value)).toBe("from-author");
			expect(canonicalTitle(x.value)).toBeNull();
		}
		const c = parseCanonicalItem({
			...baseCustom(),
			author: { id: "cid", display_name: "Disp" },
		});
		expect(c.ok).toBe(true);
		if (c.ok) {
			expect(resolveAuthorId(c.value)).toBe("cid");
			expect(resolveAuthorUsername(c.value)).toBe("Disp");
			expect(canonicalText(c.value)).toBe("hello");
		}
	});
});
