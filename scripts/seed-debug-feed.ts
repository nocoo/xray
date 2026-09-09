/**
 * Fill local D1 watchlists with mixed x.com / custom items for UI debugging.
 * Usage: bun scripts/seed-debug-feed.ts
 */
import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const d1Dir = join(root, "packages/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function openLocalD1(): Database {
	const files = readdirSync(d1Dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
	const file = files[0];
	if (!file || files.length !== 1) {
		throw new Error(`expected 1 D1 sqlite in ${d1Dir}, found ${files.length}`);
	}
	const db = new Database(join(d1Dir, file));
	db.exec("PRAGMA foreign_keys = ON;");
	return db;
}

function iso(ms: number): string {
	return new Date(ms).toISOString();
}

function picsum(id: number, w = 1200, h = 800): string {
	return `https://picsum.photos/id/${id}/${w}/${h}`;
}

function pollinations(prompt: string, seed: number): string {
	return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=768&nologo=true&seed=${seed}`;
}

const LONG_ZH =
	"这是一段故意写得很长的正文，用来撑开卡片和展开控件。第一段讲模型评测、上下文窗口和推理成本。" +
	"第二段混排 English tokens、数字 12,345 以及链接 https://xray.hexly.ai/watchlist 。\n\n" +
	"第三段换行后再写引用、列表和标签：#llm #eval #debug。继续填充直到明显超过折叠行数。" +
	"完整句子必须保留，不要在中间截断。再补两句关于时间线分页、来源过滤和自动翻译的说明。";

const LONG_EN =
	"A deliberately long English post for ExpandableText. It mixes product notes, a URL https://example.com/debug, " +
	"and enough clauses to overflow the clamp. Second paragraph talks about quoted posts, photo grids, and translation states. " +
	"Third paragraph keeps going so masonry columns get uneven heights for pagination debugging.";

type XUser = {
	id: string;
	name: string;
	username: string;
	profile_image_url?: string;
	verified?: boolean;
	public_metrics?: { followers_count: number };
};

function xItem(opts: {
	id: string;
	createdAtMs: number;
	author: XUser;
	text: string;
	metrics?: { like?: number; reply?: number; rt?: number; quote?: number; views?: number };
	media?: Array<{
		key: string;
		type: "photo" | "video" | "animated_gif";
		url: string;
		preview?: string;
	}>;
	quoted?: { id: string; text: string; author: XUser; createdAtMs: number; photo?: string };
	replyTo?: string;
	retweetedBy?: string;
	lang?: string;
}): Record<string, unknown> {
	const tweet: Record<string, unknown> = {
		id: opts.id,
		text: opts.text,
		author_id: opts.author.id,
		created_at: iso(opts.createdAtMs),
		lang: opts.lang ?? "en",
		public_metrics: {
			like_count: opts.metrics?.like ?? 12,
			reply_count: opts.metrics?.reply ?? 2,
			retweet_count: opts.metrics?.rt ?? 3,
			quote_count: opts.metrics?.quote ?? 1,
			impression_count: opts.metrics?.views ?? 900,
			bookmark_count: 4,
		},
	};
	const users = [opts.author];
	const media: Array<Record<string, unknown>> = [];
	const includesTweets: Array<Record<string, unknown>> = [];
	const refs: Array<{ type: string; id: string }> = [];

	if (opts.media?.length) {
		tweet.attachments = { media_keys: opts.media.map((m) => m.key) };
		for (const m of opts.media) {
			media.push({
				media_key: m.key,
				type: m.type,
				url: m.url,
				preview_image_url: m.preview,
				width: 1200,
				height: 800,
			});
		}
	}
	if (opts.quoted) {
		refs.push({ type: "quoted", id: opts.quoted.id });
		users.push(opts.quoted.author);
		const qTweet: Record<string, unknown> = {
			id: opts.quoted.id,
			text: opts.quoted.text,
			author_id: opts.quoted.author.id,
			created_at: iso(opts.quoted.createdAtMs),
		};
		if (opts.quoted.photo) {
			const qKey = `q-${opts.quoted.id}`;
			qTweet.attachments = { media_keys: [qKey] };
			media.push({
				media_key: qKey,
				type: "photo",
				url: opts.quoted.photo,
				width: 800,
				height: 600,
			});
		}
		includesTweets.push(qTweet);
	}
	if (opts.replyTo) refs.push({ type: "replied_to", id: opts.replyTo });
	if (opts.retweetedBy) refs.push({ type: "retweeted", id: `${opts.id}-rt` });
	if (refs.length) tweet.referenced_tweets = refs;

	return {
		source_type: "x.com",
		external_id: opts.id,
		created_at: iso(opts.createdAtMs),
		author: {
			id: opts.author.id,
			username: opts.author.username,
			display_name: opts.author.name,
			avatar_url: opts.author.profile_image_url,
		},
		meta: opts.retweetedBy ? { is_retweet: true, retweeted_by: opts.retweetedBy } : undefined,
		body: {
			kind: "x.post",
			tweet,
			includes: {
				users,
				media: media.length ? media : undefined,
				tweets: includesTweets.length ? includesTweets : undefined,
			},
		},
	};
}

function customItem(opts: {
	id: string;
	createdAtMs: number;
	handle: string;
	name?: string;
	title?: string;
	text: string;
	url?: string;
	tags?: string[];
}): Record<string, unknown> {
	return {
		source_type: "custom",
		external_id: opts.id,
		created_at: iso(opts.createdAtMs),
		author: { username: opts.handle, display_name: opts.name ?? opts.handle },
		body: {
			kind: "custom",
			title: opts.title,
			text: opts.text,
			url: opts.url,
			tags: opts.tags,
		},
	};
}

const AUTHORS: XUser[] = [
	{
		id: "u-sama",
		name: "Sam Altman",
		username: "sama",
		profile_image_url: "https://unavatar.io/x/sama",
		verified: true,
		public_metrics: { followers_count: 3_200_000 },
	},
	{
		id: "u-karpathy",
		name: "Andrej Karpathy",
		username: "karpathy",
		profile_image_url: "https://unavatar.io/x/karpathy",
		verified: true,
		public_metrics: { followers_count: 1_100_000 },
	},
	{
		id: "u-rasbt",
		name: "Sebastian Raschka",
		username: "rasbt",
		profile_image_url: "https://unavatar.io/x/rasbt",
		verified: false,
		public_metrics: { followers_count: 220_000 },
	},
	{
		id: "u-pika",
		name: "Demi Guo",
		username: "demi_guo_",
		profile_image_url: "https://unavatar.io/x/demi_guo_",
		verified: false,
		public_metrics: { followers_count: 48_000 },
	},
];

function authorAt(i: number): XUser {
	const author = AUTHORS[i % AUTHORS.length];
	if (!author) throw new Error("missing author");
	return author;
}

type Built = {
	sourceType: "x.com" | "custom";
	externalId: string;
	authorUsername: string;
	title: string | null;
	text: string;
	createdAtMs: number;
	payload: Record<string, unknown>;
	ai: "not_requested" | "pending" | "succeeded" | "failed";
	translated?: string;
	summary?: string;
	error?: string;
};

function buildFeed(prefix: string, now: number): Built[] {
	const out: Built[] = [];
	let i = 0;
	const t = () => now - i * 11 * 60_000;

	const pushX = (
		partial: Omit<Parameters<typeof xItem>[0], "id" | "createdAtMs"> & { ai?: Built["ai"] },
	) => {
		i += 1;
		const id = `${prefix}-x-${String(i).padStart(3, "0")}`;
		const createdAtMs = t();
		const payload = xItem({ ...partial, id, createdAtMs });
		const ai = partial.ai ?? "not_requested";
		out.push({
			sourceType: "x.com",
			externalId: id,
			authorUsername: partial.author.username,
			title: null,
			text: partial.text,
			createdAtMs,
			payload,
			ai,
			translated: ai === "succeeded" ? `【译】${partial.text.slice(0, 80)}` : undefined,
			summary: ai === "succeeded" ? "一句话摘要：模型与产品笔记。" : undefined,
			error: ai === "failed" ? "upstream 503" : undefined,
		});
	};

	const pushC = (
		partial: Omit<Parameters<typeof customItem>[0], "id" | "createdAtMs"> & { ai?: Built["ai"] },
	) => {
		i += 1;
		const id = `${prefix}-c-${String(i).padStart(3, "0")}`;
		const createdAtMs = t();
		const payload = customItem({ ...partial, id, createdAtMs });
		const ai = partial.ai ?? "not_requested";
		out.push({
			sourceType: "custom",
			externalId: id,
			authorUsername: partial.handle,
			title: partial.title ?? null,
			text: partial.text,
			createdAtMs,
			payload,
			ai,
			translated: ai === "succeeded" ? `【译】${partial.text.slice(0, 80)}` : undefined,
			summary: ai === "succeeded" ? "自定义条目摘要。" : undefined,
			error: ai === "failed" ? "empty model response" : undefined,
		});
	};

	const [sama, karpathy, rasbt, pika] = AUTHORS as [XUser, XUser, XUser, XUser];

	pushX({ author: sama, text: "Short status. Shipping.", metrics: { like: 2, views: 40 } });
	pushX({
		author: karpathy,
		text: "Photo from a public still: harbor light.",
		media: [{ key: "m1", type: "photo", url: picsum(1015) }],
		ai: "succeeded",
	});
	pushX({
		author: rasbt,
		text: "Two-up grid for layout debug.",
		media: [
			{ key: "m2a", type: "photo", url: picsum(1016) },
			{ key: "m2b", type: "photo", url: picsum(1018) },
		],
	});
	pushX({
		author: pika,
		text: "Four stills, SD-style public gens + picsum.",
		media: [
			{
				key: "m4a",
				type: "photo",
				url: pollinations("cinematic rainy neon alley, still frame", 11),
			},
			{
				key: "m4b",
				type: "photo",
				url: pollinations("oil painting of a quiet harbor at dusk", 12),
			},
			{ key: "m4c", type: "photo", url: picsum(1025, 900, 700) },
			{ key: "m4d", type: "photo", url: picsum(1036, 900, 700) },
		],
		ai: "pending",
	});
	pushX({
		author: sama,
		text: "Quoting a research note.",
		quoted: {
			id: `${prefix}-quoted-1`,
			text: "Quoted post with its own photo.",
			author: rasbt,
			createdAtMs: now - 3 * 3600_000,
			photo: picsum(1043, 800, 500),
		},
		ai: "succeeded",
	});
	pushX({
		author: karpathy,
		text: "Replying in-thread.",
		replyTo: `${prefix}-thread-root`,
		metrics: { reply: 18, like: 44 },
	});
	pushX({
		author: rasbt,
		text: "RT of someone else's take.",
		retweetedBy: "sama",
		metrics: { rt: 120, like: 9 },
	});
	pushX({
		author: sama,
		text: `${LONG_EN} #eval @karpathy`,
		lang: "en",
		metrics: { like: 880, views: 120_000, rt: 90, quote: 21 },
		ai: "failed",
	});
	pushX({ author: pika, text: LONG_ZH, lang: "zh", ai: "succeeded" });
	pushX({
		author: karpathy,
		text: "Sample clip for video card.",
		media: [
			{
				key: "vid1",
				type: "video",
				url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
				preview: picsum(1060, 640, 360),
			},
		],
	});

	for (const n of Array.from({ length: 50 }, (_, k) => k)) {
		const author = authorAt(n);
		const kinds = n % 5;
		if (kinds === 0) {
			pushX({
				author,
				text: `Fill item ${n}: mix of short posts so the second page is not empty.`,
				metrics: { like: n * 3, views: 200 + n * 17 },
				ai:
					n % 4 === 0
						? "not_requested"
						: n % 4 === 1
							? "succeeded"
							: n % 4 === 2
								? "failed"
								: "pending",
			});
		} else if (kinds === 1) {
			pushX({
				author,
				text: `Photo fill ${n}`,
				media: [{ key: `f${n}`, type: "photo", url: picsum(10 + (n % 40), 1000, 700) }],
			});
		} else if (kinds === 2) {
			pushC({
				handle: "hermes",
				name: "Hermes",
				title: `Digest ${n}`,
				text: `Custom fill ${n}. Notes, links, and a saveable URL.`,
				url: "https://example.com/article",
				tags: ["digest", "debug"],
				ai: n % 3 === 0 ? "succeeded" : "not_requested",
			});
		} else if (kinds === 3) {
			pushC({
				handle: "weekly",
				title: null,
				text: LONG_ZH,
				ai: n % 2 === 0 ? "failed" : "pending",
			});
		} else {
			pushX({
				author,
				text: `Quote fill ${n}`,
				quoted: {
					id: `${prefix}-qf-${n}`,
					text: "Nested quote text for embed styling.",
					author: authorAt(n + 1),
					createdAtMs: now - 86400_000,
				},
			});
		}
	}

	pushC({
		handle: "hermes",
		name: "Hermes",
		title: "Release notes",
		text: "Short custom card with a title and outbound link.",
		url: "https://github.com/nocoo/xray",
		tags: ["ship"],
		ai: "succeeded",
	});
	pushC({
		handle: "notes",
		text: "No title. Bare custom body.",
		ai: "not_requested",
	});
	pushC({
		handle: "weekly",
		title: "Long brief",
		text: LONG_EN,
		url: "https://xray.hexly.ai",
		ai: "failed",
	});

	return out;
}

function ensureMember(
	db: Database,
	userId: string,
	watchlistId: number,
	sourceType: string,
	handle: string,
	displayName: string,
) {
	db.prepare(
		`INSERT OR IGNORE INTO watchlist_members
       (user_id, watchlist_id, source_type, handle, display_name, note, added_at_ms)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
	).run(userId, watchlistId, sourceType, handle, displayName, Date.now());
}

function main() {
	const db = openLocalD1();
	const user = db.prepare(`SELECT id FROM users LIMIT 1`).get() as { id: string } | undefined;
	if (!user) throw new Error("no local user");
	const lists = db
		.prepare(`SELECT id, name FROM watchlists WHERE user_id = ? ORDER BY id`)
		.all(user.id) as Array<{
		id: number;
		name: string;
	}>;
	if (lists.length < 2) throw new Error(`need ≥2 watchlists, found ${lists.length}`);

	const now = Date.now();
	const members = [
		{ sourceType: "x.com", handle: "sama", name: "Sam Altman" },
		{ sourceType: "x.com", handle: "karpathy", name: "Andrej Karpathy" },
		{ sourceType: "x.com", handle: "rasbt", name: "Sebastian Raschka" },
		{ sourceType: "x.com", handle: "demi_guo_", name: "Demi Guo" },
		{ sourceType: "custom", handle: "hermes", name: "Hermes" },
		{ sourceType: "custom", handle: "weekly", name: "Weekly" },
		{ sourceType: "custom", handle: "notes", name: "Notes" },
	];

	const insert = db.prepare(
		`INSERT OR IGNORE INTO items
       (user_id, watchlist_id, source_type, external_id, member_id, author_username, title, text,
        created_at_ms, ingested_at_ms, payload_json, ai_status, ai_status_updated_at_ms,
        translated_text, summary_text, translation_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	);
	const findMember = db.prepare(
		`SELECT id FROM watchlist_members WHERE watchlist_id = ? AND source_type = ? AND handle = ?`,
	);

	let accepted = 0;
	for (const wl of lists.slice(0, 2)) {
		for (const m of members) {
			ensureMember(db, user.id, wl.id, m.sourceType, m.handle, m.name);
		}
		const feed = buildFeed(`dbg${wl.id}`, now - wl.id * 1000);
		for (const item of feed) {
			const mem = findMember.get(wl.id, item.sourceType, item.authorUsername) as
				| { id: number }
				| undefined;
			const info = insert.run(
				user.id,
				wl.id,
				item.sourceType,
				item.externalId,
				mem?.id ?? null,
				item.authorUsername,
				item.title,
				item.text,
				item.createdAtMs,
				now,
				JSON.stringify(item.payload),
				item.ai,
				item.ai === "pending" ? now - 30_000 : now,
				item.translated ?? null,
				item.summary ?? null,
				item.error ?? null,
			);
			if (Number(info.changes) > 0) accepted += 1;
		}
		db.prepare(
			`INSERT INTO ingest_logs
         (user_id, watchlist_id, attempted, accepted, deduped, rejected, errors_json, created_at_ms)
       VALUES (?, ?, ?, ?, 0, 0, NULL, ?)`,
		).run(user.id, wl.id, feed.length, feed.length, now);
		console.log(`${wl.name} (#${wl.id}): seeded ${feed.length} items`);
	}
	console.log(`inserted ${accepted} new rows`);
}

main();
