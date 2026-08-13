import { describe, expect, test } from "vitest";
import { mapTwitterCliEnvelope, mapTwitterCliTweetToCanonical } from "./twitter-cli-map.js";

describe("mapTwitterCliEnvelope branches", () => {
	test("ok=false envelope", () => {
		const r = mapTwitterCliEnvelope({ ok: false, error: { code: "x" } });
		expect(r.items).toEqual([]);
		expect(r.envelopeError).toBeTruthy();
	});
	test("ok=false non-object error", () => {
		const r = mapTwitterCliEnvelope({ ok: false, error: "e" });
		expect(r.envelopeError).toBeTruthy();
	});
	test("data not array", () => {
		const r = mapTwitterCliEnvelope({ ok: true, data: {} });
		expect(r.envelopeError).toMatch(/not an array/);
	});
	test("invalid envelope", () => {
		const r = mapTwitterCliEnvelope(null);
		expect(r.envelopeError).toMatch(/invalid/);
	});
	test("bare array with skip", () => {
		const r = mapTwitterCliEnvelope([
			{ id: "1" },
			{ id: "2", text: "hi", created_at: "2026-08-10T12:00:00.000Z", author: { username: "a" } },
		]);
		expect(r.skipped.length + r.items.length).toBe(2);
	});
	test("map tweet failures", () => {
		expect(mapTwitterCliTweetToCanonical(null).ok).toBe(false);
		expect(mapTwitterCliTweetToCanonical({}).ok).toBe(false);
		expect(mapTwitterCliTweetToCanonical({ id: 1 }).ok).toBe(false);
		expect(mapTwitterCliTweetToCanonical({ id: "1", text: "  " }).ok).toBe(false);
		expect(mapTwitterCliTweetToCanonical({ id: "1", text: "hi", createdAt: "bad" }).ok).toBe(false);
	});

	test("map rich tweet success paths", () => {
		const r = mapTwitterCliTweetToCanonical({
			id: 42,
			text: "hello world",
			createdAtISO: "2026-08-10T12:00:00.000+00:00",
			lang: "en",
			isRetweet: false,
			author: {
				id: "u1",
				name: "Alice",
				screenName: "alice",
				profileImageUrl: "http://cdn.example/a.png",
				verified: true,
			},
			metrics: {
				likes: 1,
				retweets: 2,
				replies: 3,
				quotes: 4,
				views: 5,
				bookmarks: 6,
			},
			media: [
				{ type: "photo", url: "https://cdn.example/m.jpg", width: 10, height: 10 },
				{ type: "nope", url: "https://x" },
			],
			quotedTweet: {
				id: "9",
				text: "q",
				author: { id: "u2", screenName: "bob", name: "Bob" },
			},
		});
		expect(r.ok).toBe(true);
		if (r.ok && r.value.source_type === "x.com") {
			expect(r.value.body.includes?.tweets?.[0]?.id).toBe("9");
			expect(r.value.body.includes?.users?.map((u) => u.username).sort()).toEqual(["alice", "bob"]);
		}
	});

	test("quote without text keeps ref only; empty retweetedBy ignored", () => {
		const bare = mapTwitterCliTweetToCanonical({
			id: "1",
			text: "hi",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			author: { id: "u1", name: "A", screenName: "a" },
			quotedTweet: { id: "9", text: "   " },
		});
		expect(bare.ok).toBe(true);
		if (bare.ok && bare.value.source_type === "x.com") {
			expect(bare.value.body.tweet.referenced_tweets).toEqual([{ type: "quoted", id: "9" }]);
			expect(bare.value.body.includes?.tweets).toBeUndefined();
		}

		const rt = mapTwitterCliTweetToCanonical({
			id: "2",
			text: "hi",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			isRetweet: true,
			retweetedBy: "  ",
			author: { id: "u1", name: "A", screenName: "a" },
		});
		expect(rt.ok).toBe(true);
		if (rt.ok) {
			expect(rt.value.meta?.is_retweet).toBe(true);
			expect(rt.value.meta?.retweeted_by).toBeUndefined();
		}
	});

	test("quote author edge branches and retweetedBy-only meta", () => {
		// no quote author → tweet embed without author_id / extra user
		const noAuthor = mapTwitterCliTweetToCanonical({
			id: "1",
			text: "hi",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			author: { id: "u1", name: "A", screenName: "a" },
			quotedTweet: { id: "q1", text: "only text" },
		});
		expect(noAuthor.ok).toBe(true);
		if (noAuthor.ok && noAuthor.value.source_type === "x.com") {
			expect(noAuthor.value.body.includes?.tweets?.[0]).toEqual({ id: "q1", text: "only text" });
			expect(noAuthor.value.body.includes?.users?.every((u) => u.id === "u1")).toBe(true);
		}

		// username only (synthetic id), no display name, verified false, bad avatar
		const synth = mapTwitterCliTweetToCanonical({
			id: "2",
			text: "hi",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			author: { id: "u1", name: "A", screenName: "a" },
			quotedTweet: {
				id: "q2",
				text: "quoted",
				author: {
					screenName: "BobOnly",
					verified: false,
					profileImageUrl: "ftp://bad",
				},
			},
		});
		expect(synth.ok).toBe(true);
		if (synth.ok && synth.value.source_type === "x.com") {
			const bob = synth.value.body.includes?.users?.find((u) => u.username === "bobonly");
			expect(bob?.id).toBe("u:bobonly");
			expect(bob?.name).toBe("bobonly");
			expect(bob?.verified).toBe(false);
			expect(bob?.profile_image_url).toBeUndefined();
			expect(synth.value.body.includes?.tweets?.[0]?.author_id).toBe("u:bobonly");
		}

		// quote author same as main → pushUser dedupe
		const same = mapTwitterCliTweetToCanonical({
			id: "3",
			text: "self quote",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			author: { id: "u1", name: "A", screenName: "a" },
			quotedTweet: {
				id: "q3",
				text: "mine",
				author: { id: "u1", screenName: "a", name: "A" },
			},
		});
		expect(same.ok).toBe(true);
		if (same.ok && same.value.source_type === "x.com") {
			expect(same.value.body.includes?.users).toHaveLength(1);
		}

		// retweetedBy alone (isRetweet omitted) still marks RT
		const byOnly = mapTwitterCliTweetToCanonical({
			id: "4",
			text: "rt body",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			retweetedBy: "@SomeOne",
			author: { id: "o1", name: "Orig", screenName: "orig" },
		});
		expect(byOnly.ok).toBe(true);
		if (byOnly.ok) {
			expect(byOnly.value.meta?.is_retweet).toBe(true);
			expect(byOnly.value.meta?.retweeted_by).toBe("someone");
		}

		// quotedTweet not object / missing id → ignored
		const badQt = mapTwitterCliTweetToCanonical({
			id: "5",
			text: "hi",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			quotedTweet: "nope" as unknown as null,
		});
		expect(badQt.ok).toBe(true);
		if (badQt.ok && badQt.value.source_type === "x.com") {
			expect(badQt.value.body.tweet.referenced_tweets).toBeUndefined();
		}
	});

	test("toRfc3339Z twitter classic date via map", () => {
		const r = mapTwitterCliTweetToCanonical({
			id: "1",
			text: "hi",
			createdAt: "Sat May 02 22:30:18 +0000 2026",
			author: { screenName: "a" },
		});
		expect(r.ok).toBe(true);
	});

	test("httpsUrl http upgrade and invalid media", () => {
		const r = mapTwitterCliTweetToCanonical({
			id: "1",
			text: "hi",
			createdAtISO: "2026-08-10T12:00:00.000Z",
			author: { screenName: "a", profileImageUrl: "not-url" },
			media: [
				{ type: "video", url: "ftp://x" },
				{ type: "animated_gif", url: "https://ok" },
			],
		});
		expect(r.ok).toBe(true);
	});
});
