import { describe, expect, test, vi } from "vitest";
import type { Member, TimelineItem, Watchlist } from "@/api/watchlists";
import {
	chunkFeedPages,
	createWatchlistDetailVm,
	filterMembers,
	ITEMS_PAGE_LIMIT,
	itemToTweet,
	memberToCard,
	sourceCounts,
} from "./watchlist-detail-vm";

const wl: Watchlist = {
	id: 3,
	name: "WL",
	description: null,
	icon: "eye",
	translateEnabled: true,
	createdAtMs: 1,
	memberCount: 1,
};

const member: Member = {
	id: 1,
	watchlistId: 3,
	sourceType: "x.com",
	externalAuthorId: null,
	handle: "alice",
	displayName: "Alice",
	note: null,
	addedAtMs: 1,
	tags: [],
};

const item: TimelineItem = {
	id: 99,
	watchlistId: 3,
	sourceType: "x.com",
	externalId: "t1",
	memberId: 1,
	authorUsername: "alice",
	title: null,
	text: "hello world",
	createdAtMs: 1_700_000_000_000,
	ingestedAtMs: 1_700_000_000_000,
	payload: {
		body: { tweet: { id: "t1", text: "hello world", author_id: "u1" }, includes: { users: [] } },
		author: { id: "u1", username: "alice", display_name: "Alice" },
	},
	aiStatus: "pending",
	translatedText: null,
	summaryText: null,
	translationError: null,
};

describe("watchlist-detail pure helpers", () => {
	test("memberToCard + itemToTweet + filters", () => {
		const card = memberToCard(member);
		expect(card.handle).toBe("alice");
		expect(card.profile?.displayName).toBe("Alice");
		const noName = memberToCard({ ...member, displayName: null, sourceType: "custom" });
		expect(noName.profile).toBeNull();
		expect(itemToTweet({ ...item, sourceType: "custom" })).toBeNull();
		const tweet = itemToTweet(item);
		expect(tweet?.id).toBe("t1");
		expect(tweet?.author.username).toBe("alice");
		const bare = itemToTweet({
			...item,
			authorUsername: null,
			payload: null,
			externalId: "e9",
			text: "t",
		});
		expect(bare?.author.username).toBe("unknown");
		expect(bare?.url).toContain("/i/status/");
		const fromAuthor = itemToTweet({
			...item,
			payload: {
				author: {
					id: "u9",
					username: "bob",
					display_name: "Bob",
					avatar_url: "https://img",
				},
				body: { tweet: { id: "tid", text: "hi" } },
			},
		});
		expect(fromAuthor?.author.username).toBe("bob");
		expect(fromAuthor?.author.profile_image_url).toBe("https://img");
		const fromIncludes = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: { id: "x", text: "y", author_id: "u1" },
					includes: { users: [{ id: "u1", username: "inc", name: "Inc" }] },
				},
			},
		});
		expect(fromIncludes?.author.username).toBe("inc");
		expect(filterMembers([member], "custom")).toEqual([]);
		expect(filterMembers([member], "x.com")).toHaveLength(1);
		expect(filterMembers([member], "all")).toHaveLength(1);
		expect(sourceCounts([item, { ...item, id: 2, sourceType: "custom" }])).toEqual({
			all: 2,
			"x.com": 1,
			custom: 1,
		});
	});

	test("chunkFeedPages isolates appended pages so older membership cannot rebalance", () => {
		expect(chunkFeedPages([])).toEqual([]);
		expect(chunkFeedPages([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
		const first = Array.from({ length: ITEMS_PAGE_LIMIT }, (_, i) => i + 1);
		const second = Array.from({ length: ITEMS_PAGE_LIMIT }, (_, i) => i + 1 + ITEMS_PAGE_LIMIT);
		const before = chunkFeedPages(first);
		const after = chunkFeedPages([...first, ...second]);
		expect(before).toHaveLength(1);
		expect(after).toHaveLength(2);
		expect(after[0]).toEqual(before[0]);
		expect(after[1]).toEqual(second);
		expect(chunkFeedPages([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
	});
});

describe("createWatchlistDetailVm", () => {
	test("load translate loadMore patch", async () => {
		const api = {
			fetchWatchlist: vi.fn().mockResolvedValue(wl),
			fetchMembers: vi.fn().mockResolvedValue([member]),
			fetchItems: vi
				.fn()
				.mockResolvedValueOnce({ items: [item], next_cursor: "c2" })
				.mockResolvedValueOnce({ items: [{ ...item, id: 100 }], next_cursor: null })
				.mockResolvedValueOnce({ items: [item], next_cursor: null })
				.mockResolvedValueOnce({ items: [item], next_cursor: "c3" })
				.mockResolvedValueOnce({ items: [{ ...item, id: 101 }], next_cursor: null }),
			fetchWatchlistIngestLogs: vi.fn().mockResolvedValue([]),
			deleteMember: vi.fn().mockResolvedValue({ deleted: true }),
			updateWatchlist: vi.fn().mockResolvedValue({ ...wl, translateEnabled: false }),
			translateWatchlist: vi.fn().mockResolvedValue({ results: [], timed_out: false }),
		};
		const vm = createWatchlistDetailVm(api, 3);
		await vm.load();
		expect(vm.getState().wl?.name).toBe("WL");
		expect(vm.getState().nextCursor).toBe("c2");
		await vm.loadMore();
		expect(vm.getState().items).toHaveLength(2);
		vm.onItemTranslated(99, { translatedText: "你好", summaryText: "s" });
		expect(vm.getState().items.find((i) => i.id === 99)?.translatedText).toBe("你好");
		vm.onItemTranslated(99, { translatedText: "你好2" });
		expect(vm.getState().items.find((i) => i.id === 99)?.summaryText).toBeNull();
		vm.onItemTranslated(404, { translatedText: "x" });
		await vm.translate();
		expect(api.translateWatchlist).toHaveBeenCalledWith(3, { limit: 20 });
		await vm.removeMember(1);
		expect(api.deleteMember).toHaveBeenCalledWith(3, 1);
		vm.setSourceFilter("x.com");
		await vi.waitFor(() => expect(api.fetchItems).toHaveBeenCalled());
		// filtered load more path
		api.fetchItems
			.mockResolvedValueOnce({ items: [item], next_cursor: "c3" })
			.mockResolvedValueOnce({ items: [{ ...item, id: 102 }], next_cursor: null });
		await vm.load();
		await vm.loadMore();
		expect(vm.getState().items.some((i) => i.id === 102)).toBe(true);
		// silent load
		await vm.load({ silent: true });
		// loadMore while already loadingMore is no-op when nextCursor null after last
		vm.getState();
		await vm.loadMore();
	});

	test("invalid id", async () => {
		const vm = createWatchlistDetailVm(
			{
				fetchWatchlist: vi.fn(),
				fetchMembers: vi.fn(),
				fetchItems: vi.fn(),
				fetchWatchlistIngestLogs: vi.fn(),
				deleteMember: vi.fn(),
				updateWatchlist: vi.fn(),
				translateWatchlist: vi.fn(),
			},
			0,
		);
		await vm.load();
		expect(vm.getState().error).toBe("invalid watchlist");
	});

	test("setTranslateEnabled and loadLogs", async () => {
		const api = {
			fetchWatchlist: vi.fn().mockResolvedValue(wl),
			fetchMembers: vi.fn().mockResolvedValue([]),
			fetchItems: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
			fetchWatchlistIngestLogs: vi
				.fn()
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([
					{
						id: 1,
						watchlistId: 3,
						attempted: 2,
						accepted: 1,
						deduped: 1,
						rejected: 0,
						errorsJson: null,
						createdAtMs: 1,
					},
				])
				.mockRejectedValueOnce(new Error("logs down")),
			deleteMember: vi.fn(),
			updateWatchlist: vi
				.fn()
				.mockResolvedValueOnce({ ...wl, translateEnabled: false })
				.mockRejectedValueOnce(new Error("save failed")),
			translateWatchlist: vi.fn(),
		};
		const vm = createWatchlistDetailVm(api, 3);
		// no-op when wl not loaded yet
		await vm.setTranslateEnabled(true);
		expect(api.updateWatchlist).not.toHaveBeenCalled();

		await vm.load();
		await vm.setTranslateEnabled(false);
		expect(api.updateWatchlist).toHaveBeenCalledWith(3, { translateEnabled: false });
		expect(vm.getState().wl?.translateEnabled).toBe(false);
		await vm.setTranslateEnabled(true);
		expect(vm.getState().settingsError).toBe("save failed");
		expect(vm.getState().wl?.translateEnabled).toBe(false);
		// load() already consumed first mock ([]); this is second mock (1 log)
		await vm.loadLogs();
		expect(vm.getState().logs).toHaveLength(1);
		expect(vm.getState().logsError).toBeNull();
		await vm.loadLogs();
		expect(vm.getState().logsError).toBe("logs down");
		// page-wide error must stay clear for panel-local log failures
		expect(vm.getState().error).toBeNull();

		const badId = createWatchlistDetailVm(api, 0);
		await badId.loadLogs();
		await badId.setTranslateEnabled(true);
		expect(api.updateWatchlist).toHaveBeenCalledTimes(2);
	});

	test("translate failure only rolls back enabled flag after concurrent reload", async () => {
		let resolvePatch: (v: unknown) => void = () => undefined;
		const patchPromise = new Promise((resolve) => {
			resolvePatch = resolve;
		});
		const api = {
			fetchWatchlist: vi
				.fn()
				.mockResolvedValueOnce(wl)
				.mockResolvedValueOnce({ ...wl, name: "Reloaded" }),
			fetchMembers: vi.fn().mockResolvedValue([]),
			fetchItems: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
			fetchWatchlistIngestLogs: vi.fn().mockResolvedValue([]),
			deleteMember: vi.fn(),
			updateWatchlist: vi.fn().mockReturnValue(patchPromise),
			translateWatchlist: vi.fn(),
		};
		const vm = createWatchlistDetailVm(api, 3);
		await vm.load();
		const pending = vm.setTranslateEnabled(false);
		expect(vm.getState().wl?.translateEnabled).toBe(false);
		// Concurrent reload brings fresher name while PATCH still in flight
		await vm.load();
		expect(vm.getState().wl?.name).toBe("Reloaded");
		resolvePatch(Promise.reject(new Error("save failed")));
		await pending.catch(() => undefined);
		await vi.waitFor(() => expect(vm.getState().settingsError).toBe("save failed"));
		expect(vm.getState().wl?.name).toBe("Reloaded");
		expect(vm.getState().wl?.translateEnabled).toBe(true);
	});

	test("stale translate and loadLogs responses are ignored", async () => {
		let resolveSlowLogs: (v: unknown) => void = () => undefined;
		let rejectSlowLogs: (e: unknown) => void = () => undefined;
		let resolveSlowPatch: (v: unknown) => void = () => undefined;
		let rejectSlowPatch: (e: unknown) => void = () => undefined;
		const slowLogsOk = new Promise((resolve) => {
			resolveSlowLogs = resolve;
		});
		const slowLogsErr = new Promise((_, reject) => {
			rejectSlowLogs = reject;
		});
		const slowPatchOk = new Promise((resolve) => {
			resolveSlowPatch = resolve;
		});
		const slowPatchErr = new Promise((_, reject) => {
			rejectSlowPatch = reject;
		});
		const logRow = (id: number) => ({
			id,
			watchlistId: 3,
			attempted: 1,
			accepted: 1,
			deduped: 0,
			rejected: 0,
			errorsJson: null,
			createdAtMs: id,
		});
		const api = {
			fetchWatchlist: vi.fn().mockResolvedValue(wl),
			fetchMembers: vi.fn().mockResolvedValue([]),
			fetchItems: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
			fetchWatchlistIngestLogs: vi
				.fn()
				.mockResolvedValueOnce([]) // initial load()
				.mockReturnValueOnce(slowLogsOk)
				.mockResolvedValueOnce([logRow(9)])
				.mockReturnValueOnce(slowLogsErr)
				.mockResolvedValueOnce([logRow(10)]),
			deleteMember: vi.fn(),
			updateWatchlist: vi
				.fn()
				.mockReturnValueOnce(slowPatchOk)
				.mockResolvedValueOnce({ ...wl, translateEnabled: false })
				.mockReturnValueOnce(slowPatchErr)
				.mockResolvedValueOnce({ ...wl, translateEnabled: true }),
			translateWatchlist: vi.fn(),
		};
		const vm = createWatchlistDetailVm(api, 3);
		await vm.load();

		// Stale success
		const firstLogs = vm.loadLogs();
		await vm.loadLogs();
		expect(vm.getState().logs[0]?.id).toBe(9);
		resolveSlowLogs([logRow(1)]);
		await firstLogs;
		expect(vm.getState().logs[0]?.id).toBe(9);

		// Stale error
		const staleErrLogs = vm.loadLogs();
		await vm.loadLogs();
		expect(vm.getState().logs[0]?.id).toBe(10);
		rejectSlowLogs(new Error("stale logs fail"));
		await staleErrLogs.catch(() => undefined);
		expect(vm.getState().logsError).toBeNull();
		expect(vm.getState().logs[0]?.id).toBe(10);

		// Stale translate success
		const firstPatch = vm.setTranslateEnabled(false);
		await vm.setTranslateEnabled(false);
		await vi.waitFor(() => expect(vm.getState().settingsSaving).toBe(false));
		resolveSlowPatch({ ...wl, translateEnabled: false, name: "STALE_OK" });
		await firstPatch;
		expect(vm.getState().wl?.name).not.toBe("STALE_OK");

		// Stale translate error must not flip flag / set error after newer success
		const stalePatch = vm.setTranslateEnabled(false);
		await vm.setTranslateEnabled(true);
		await vi.waitFor(() => expect(vm.getState().wl?.translateEnabled).toBe(true));
		const errBefore = vm.getState().settingsError;
		rejectSlowPatch(new Error("stale patch fail"));
		await stalePatch.catch(() => undefined);
		expect(vm.getState().wl?.translateEnabled).toBe(true);
		expect(vm.getState().settingsError).toBe(errBefore);
	});

	test("itemToTweet more author branches", () => {
		const t = itemToTweet({
			...item,
			authorUsername: "from-item",
			payload: {
				body: {
					tweet: { text: "t" },
					includes: { users: [{ id: "x", username: "u" }] },
				},
			},
		});
		expect(t?.author.username).toBe("from-item");
		const t2 = itemToTweet({
			...item,
			sourceType: "x.com",
			payload: {
				body: { tweet: { id: "i", text: "x", author_id: "missing" }, includes: { users: [] } },
			},
		});
		expect(t2?.id).toBe("i");
	});

	test("itemToTweet maps media metrics and prefers post created_at", () => {
		const postIso = "2026-08-01T12:00:00.000Z";
		const t = itemToTweet({
			...item,
			// deliberate wrong column — payload tweet.created_at must win
			createdAtMs: Date.parse("2099-01-01T00:00:00.000Z"),
			ingestedAtMs: Date.parse("2099-01-01T00:00:00.000Z"),
			payload: {
				author: { id: "u1", username: "alice", display_name: "Alice" },
				body: {
					tweet: {
						id: "t1",
						text: "with media",
						author_id: "u1",
						created_at: postIso,
						public_metrics: {
							like_count: 12,
							retweet_count: 3,
							reply_count: 1,
							quote_count: 0,
							impression_count: 99,
							bookmark_count: 2,
						},
						attachments: { media_keys: ["m0", "m1", "m2"] },
						referenced_tweets: [{ type: "quoted", id: "q1" }],
					},
					includes: {
						users: [
							{
								id: "u1",
								username: "alice",
								name: "Alice",
								profile_image_url: "https://pbs.twimg.com/a.jpg",
								verified: true,
							},
							{ id: "u2", username: "bob", name: "Bob" },
						],
						media: [
							{ media_key: "m0", type: "photo", url: "https://pbs.twimg.com/media/a.jpg" },
							{
								media_key: "m1",
								type: "video",
								url: "https://video.twimg.com/v.mp4",
								preview_image_url: "https://pbs.twimg.com/media/v.jpg",
							},
							{
								media_key: "m2",
								type: "animated_gif",
								url: "https://video.twimg.com/g.mp4",
							},
						],
						tweets: [
							{
								id: "q1",
								text: "quoted",
								author_id: "u2",
								created_at: "2026-07-01T00:00:00.000Z",
								attachments: { media_keys: ["m0"] },
							},
						],
					},
				},
			},
		});
		expect(t?.created_at).toBe(postIso);
		expect(t?.metrics.like_count).toBe(12);
		expect(t?.metrics.view_count).toBe(99);
		expect(t?.media).toHaveLength(3);
		expect(t?.media?.[0]?.type).toBe("PHOTO");
		expect(t?.media?.[1]?.type).toBe("VIDEO");
		expect(t?.media?.[1]?.thumbnail_url).toContain("v.jpg");
		expect(t?.media?.[2]?.type).toBe("GIF");
		expect(t?.is_quote).toBe(true);
		expect(t?.quoted_tweet?.text).toBe("quoted");
		expect(t?.quoted_tweet?.author.username).toBe("bob");
		expect(t?.quoted_tweet?.media?.[0]?.type).toBe("PHOTO");
	});

	test("itemToTweet reads retweeted_by from meta when no retweeted ref", () => {
		const t = itemToTweet({
			...item,
			payload: {
				meta: { producer: "twitter-cli", is_retweet: true, retweeted_by: "wl_member" },
				author: { id: "o1", username: "orig", display_name: "Orig" },
				body: {
					tweet: {
						id: "orig1",
						text: "original body",
						author_id: "o1",
						created_at: "2026-08-01T00:00:00.000Z",
					},
					includes: {
						users: [{ id: "o1", username: "orig", name: "Orig" }],
					},
				},
			},
		});
		expect(t?.is_retweet).toBe(true);
		expect(t?.retweeted_by).toBe("wl_member");
		expect(t?.author.username).toBe("orig");

		// @-prefix stripped; is_retweet inferred from retweeted_by alone
		const t2 = itemToTweet({
			...item,
			payload: {
				meta: { retweeted_by: "@Alice" },
				body: {
					tweet: { id: "x", text: "t", created_at: "2026-08-01T00:00:00.000Z" },
				},
			},
		});
		expect(t2?.is_retweet).toBe(true);
		expect(t2?.retweeted_by).toBe("alice");

		// blank retweeted_by ignored; is_retweet flag alone still works
		const t3 = itemToTweet({
			...item,
			payload: {
				meta: { is_retweet: true, retweeted_by: "   " },
				body: {
					tweet: { id: "y", text: "t", created_at: "2026-08-01T00:00:00.000Z" },
				},
			},
		});
		expect(t3?.is_retweet).toBe(true);
		expect(t3?.retweeted_by).toBeUndefined();
	});

	test("itemToTweet quoted author from includes with avatar fallbacks", () => {
		const withAvatar = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "p",
						text: "quote",
						created_at: "2026-08-01T00:00:00.000Z",
						referenced_tweets: [{ type: "quoted", id: "q1" }],
					},
					includes: {
						users: [
							{
								id: "u2",
								username: "bob",
								name: "Bob",
								profile_image_url: "https://pbs/b.jpg",
								verified: true,
								public_metrics: { followers_count: 9 },
							},
						],
						tweets: [{ id: "q1", text: "orig", author_id: "u2" }],
					},
				},
			},
		});
		expect(withAvatar?.quoted_tweet?.author).toMatchObject({
			username: "bob",
			name: "Bob",
			profile_image_url: "https://pbs/b.jpg",
			is_verified: true,
			followers_count: 9,
		});

		// no profile_image_url → unavatar; sparse user fields
		const sparse = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "p2",
						text: "q",
						created_at: "2026-08-01T00:00:00.000Z",
						referenced_tweets: [{ type: "quoted", id: "q2" }],
					},
					includes: {
						users: [{ id: "u3", username: "c" }],
						tweets: [{ id: "q2", text: "t", author_id: "u3" }],
					},
				},
			},
		});
		expect(sparse?.quoted_tweet?.author.username).toBe("c");
		expect(sparse?.quoted_tweet?.author.name).toBe("c");
		expect(sparse?.quoted_tweet?.author.profile_image_url).toContain("unavatar.io/x/c");

		// author_id present but user missing from includes
		const miss = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "p3",
						text: "q",
						created_at: "2026-08-01T00:00:00.000Z",
						referenced_tweets: [{ type: "quoted", id: "q3" }],
					},
					includes: {
						tweets: [{ id: "q3", text: "t", author_id: "ghost" }],
					},
				},
			},
		});
		expect(miss?.quoted_tweet?.author.username).toBe("unknown");
		expect(miss?.quoted_tweet?.author.id).toBe("ghost");
	});

	test("itemToTweet media edge cases and reply/retweet flags", () => {
		const t = itemToTweet({
			...item,
			createdAtMs: 0,
			payload: {
				body: {
					tweet: {
						id: "r1",
						text: "rt",
						created_at: "not-a-date",
						attachments: { media_keys: ["missing", "bad", "ok"] },
						referenced_tweets: [
							{ type: "retweeted", id: "orig" },
							{ type: "replied_to", id: "parent" },
						],
					},
					includes: {
						media: [
							{ media_key: "bad", type: "unknown", url: "https://x.com/a.jpg" },
							{ media_key: "ok", type: "PHOTO", url: "https://pbs.twimg.com/ok.jpg" },
							{ media_key: "nurl", type: "photo" },
						],
					},
				},
			},
		});
		expect(t?.is_retweet).toBe(true);
		expect(t?.is_reply).toBe(true);
		expect(t?.reply_to_id).toBe("parent");
		// invalid tweet.created_at + createdAtMs<=0 → epoch 0
		expect(t?.created_at).toBe(new Date(0).toISOString());
		expect(t?.media).toHaveLength(1);
		expect(t?.media?.[0]?.type).toBe("PHOTO");

		const emptyMedia = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: { id: "e", text: "e", attachments: { media_keys: ["x"] } },
					includes: { media: [] },
				},
			},
		});
		expect(emptyMedia?.media).toBeUndefined();

		const gifAlias = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "g",
						text: "g",
						created_at: "2026-08-01T00:00:00.000Z",
						attachments: { media_keys: ["g0"] },
					},
					includes: {
						media: [{ media_key: "g0", type: "gif", url: "https://video.twimg.com/g.mp4" }],
					},
				},
			},
		});
		expect(gifAlias?.media?.[0]?.type).toBe("GIF");
	});

	test("itemToTweet quoted miss and video type aliases", () => {
		const t = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "v1",
						text: "v",
						lang: "en",
						created_at: "2026-08-01T00:00:00.000Z",
						attachments: { media_keys: ["v0"] },
						referenced_tweets: [{ type: "quoted", id: "nope" }],
					},
					includes: {
						media: [
							{
								media_key: "v0",
								type: "VIDEO",
								url: "https://video.twimg.com/v.mp4",
								preview_image_url: "",
							},
						],
						tweets: [],
					},
				},
			},
		});
		expect(t?.is_quote).toBe(true);
		expect(t?.quoted_tweet).toBeUndefined();
		expect(t?.lang).toBe("en");
		expect(t?.media?.[0]?.type).toBe("VIDEO");
		expect(t?.media?.[0]?.thumbnail_url).toBeUndefined();

		// no media keys
		const bare = itemToTweet({
			...item,
			payload: { body: { tweet: { id: "b", text: "b", created_at: "2026-08-01T00:00:00.000Z" } } },
		});
		expect(bare?.media).toBeUndefined();

		// media entries without media_key skipped
		const skip = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "s",
						text: "s",
						created_at: "2026-08-01T00:00:00.000Z",
						attachments: { media_keys: ["k"] },
					},
					includes: { media: [{ type: "photo", url: "https://pbs.twimg.com/x.jpg" }] },
				},
			},
		});
		expect(skip?.media).toBeUndefined();
	});

	test("itemToTweet quoted author unknown and missing quoted id", () => {
		const t = itemToTweet({
			...item,
			authorUsername: null,
			payload: {
				body: {
					tweet: {
						id: "p",
						text: "p",
						created_at: "2026-08-01T00:00:00.000Z",
						referenced_tweets: [{ type: "quoted", id: "q9" }],
					},
					includes: {
						// no users for quoted author → unknown username → i/status url
						tweets: [{ id: "q9", text: undefined as unknown as string }],
					},
				},
			},
		});
		expect(t?.quoted_tweet?.url).toContain("/i/status/q9");
		expect(t?.quoted_tweet?.text).toBe("");
		// missing quoted created_at → empty (do not fabricate parent time)
		expect(t?.quoted_tweet?.created_at).toBe("");

		// force quoted id fallback when qt.id missing
		const t2 = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: {
						id: "p2",
						text: "p2",
						created_at: "2026-08-01T00:00:00.000Z",
						referenced_tweets: [{ type: "quoted", id: "only-ref" }],
					},
					includes: {
						users: [{ id: "u9", username: "qx", name: "QX" }],
						tweets: [{ author_id: "u9", text: "hi" }],
					},
				},
			},
		});
		// find by id fails (tweet has no id) → no quoted body
		expect(t2?.quoted_tweet).toBeUndefined();
	});

	test("load/loadMore/translate/remove errors + filter reload", async () => {
		const api = {
			fetchWatchlist: vi.fn().mockRejectedValueOnce(new Error("L")).mockResolvedValue(wl),
			fetchMembers: vi.fn().mockResolvedValue([member]),
			fetchItems: vi.fn().mockResolvedValue({ items: [item], next_cursor: null }),
			fetchWatchlistIngestLogs: vi.fn().mockResolvedValue([]),
			deleteMember: vi.fn().mockRejectedValue(new Error("rm")),
			updateWatchlist: vi.fn().mockResolvedValue(wl),
			translateWatchlist: vi
				.fn()
				.mockResolvedValueOnce({ results: [], timed_out: true })
				.mockRejectedValueOnce(new Error("tr")),
		};
		const vm = createWatchlistDetailVm(api, 3);
		await vm.load();
		expect(vm.getState().error).toBe("L");
		api.fetchWatchlist.mockResolvedValue(wl);
		await vm.load();
		await vm.translate();
		expect(vm.getState().error).toContain("timed out");
		await vm.translate();
		expect(vm.getState().error).toBe("tr");
		await vm.removeMember(1);
		expect(vm.getState().error).toBe("rm");
		vm.setActiveTab("members");
		expect(vm.getState().activeTab).toBe("members");
		vm.setSourceFilter("custom");
		expect(vm.getState().sourceFilter).toBe("custom");
		// loadMore no-op without cursor
		await vm.loadMore();
		api.fetchItems
			.mockResolvedValueOnce({ items: [item], next_cursor: "n" })
			.mockRejectedValueOnce(new Error("more"));
		await vm.load();
		await vm.loadMore();
		expect(vm.getState().error).toBe("more");
	});
});
