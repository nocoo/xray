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
