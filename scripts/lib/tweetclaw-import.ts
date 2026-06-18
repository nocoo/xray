import type { RawTweetsFile, Tweet, TweetAuthor, TweetEntities, TweetMedia, TweetMetrics } from "./types";

type JsonRecord = Record<string, unknown>;

const WRAPPED_ARRAY_KEYS = ["tweets", "data", "results", "items", "records"];
const TEXT_KEYS = ["text", "full_text", "fullText", "content", "tweet", "body"];
const ID_KEYS = ["id", "tweet_id", "tweetId", "status_id", "statusId"];
const CREATED_KEYS = ["created_at", "created", "createdAt", "posted_at", "published_at", "timestamp", "date"];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }
  }
  return undefined;
}

function firstRecord(record: JsonRecord, keys: string[]): JsonRecord | undefined {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function firstNumber(record: JsonRecord, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    const parsed = toNumber(value);
    if (parsed !== 0 || value === 0 || value === "0") {
      return parsed;
    }
  }
  return 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return value === 1;
}

function normalizeUsername(value: string | undefined): string {
  return value?.replace(/^@/, "").trim() || "unknown";
}

function normalizeDate(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function parseJsonRecords(content: string): JsonRecord[] | null {
  try {
    return recordsFromJson(JSON.parse(content));
  } catch {
    return null;
  }
}

function parseJsonlRecords(content: string): JsonRecord[] | null {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const records: JsonRecord[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (!isRecord(parsed)) {
        return null;
      }
      records.push(parsed);
    } catch {
      return null;
    }
  }
  return records;
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseCsvRecords(content: string): JsonRecord[] {
  const rows = parseCsvRows(content).filter((row) => row.some((cell) => cell.trim()));
  const header = rows.shift()?.map((cell) => cell.trim());
  if (!header || header.length === 0) {
    return [];
  }

  return rows.map((row) => {
    const record: JsonRecord = {};
    header.forEach((key, index) => {
      if (key) {
        record[key] = row[index]?.trim() ?? "";
      }
    });
    return record;
  });
}

function recordsFromJson(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of WRAPPED_ARRAY_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [value];
}

function normalizeMetrics(record: JsonRecord): TweetMetrics {
  const nested = firstRecord(record, ["metrics", "public_metrics", "analytics"]) ?? record;
  return {
    retweet_count: firstNumber(nested, ["retweet_count", "retweets", "retweetCount", "repost_count", "reposts"]),
    like_count: firstNumber(nested, ["like_count", "likes", "favorite_count", "favorites", "faves"]),
    reply_count: firstNumber(nested, ["reply_count", "replies", "comments"]),
    quote_count: firstNumber(nested, ["quote_count", "quotes"]),
    view_count: firstNumber(nested, ["view_count", "views", "impressions"]),
    bookmark_count: firstNumber(nested, ["bookmark_count", "bookmarks"]),
  };
}

function normalizeAuthor(record: JsonRecord): TweetAuthor {
  const author = firstRecord(record, ["author", "user", "account"]) ?? record;
  const username = normalizeUsername(
    firstString(author, ["username", "screen_name", "screenName", "handle"])
      ?? firstString(record, ["username", "author_username", "screen_name", "user_screen_name"])
  );

  return {
    id: firstString(author, ["id", "user_id", "userId", "author_id", "rest_id"]) ?? username,
    username,
    name: firstString(author, ["name", "display_name", "displayName", "author_name"]) ?? username,
    profile_image_url: firstString(author, ["profile_image_url", "profileImageUrl", "avatar", "avatar_url"]),
    followers_count: firstNumber(author, ["followers_count", "followers", "followersCount"]),
    is_verified: toBoolean(author.verified ?? author.is_verified ?? author.isVerified),
  };
}

function normalizeEntities(record: JsonRecord): TweetEntities | undefined {
  const entities = firstRecord(record, ["entities"]) ?? record;
  const hashtags = toStringArray(entities.hashtags);
  const mentionedUsers = toStringArray(entities.mentioned_users ?? entities.mentions);
  const urls = toStringArray(entities.urls);

  if (hashtags.length === 0 && mentionedUsers.length === 0 && urls.length === 0) {
    return undefined;
  }

  return {
    hashtags,
    mentioned_users: mentionedUsers,
    urls,
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      return [item.trim()];
    }
    if (isRecord(item)) {
      const text = firstString(item, ["text", "tag", "screen_name", "username", "url", "expanded_url"]);
      return text ? [text] : [];
    }
    return [];
  });
}

function normalizeMedia(record: JsonRecord): TweetMedia[] | undefined {
  const rawMedia = record.media;
  if (!Array.isArray(rawMedia)) {
    return undefined;
  }

  const media = rawMedia.flatMap((item, index): TweetMedia[] => {
    if (!isRecord(item)) {
      return [];
    }
    const url = firstString(item, ["url", "media_url", "mediaUrl", "preview_image_url"]);
    if (!url) {
      return [];
    }
    const type = normalizeMediaType(firstString(item, ["type", "media_type", "mediaType"]));
    return [{
      id: firstString(item, ["id", "media_key", "mediaKey"]) ?? `${index}`,
      type,
      url,
      thumbnail_url: firstString(item, ["thumbnail_url", "thumbnailUrl", "preview_image_url"]),
    }];
  });

  return media.length > 0 ? media : undefined;
}

function normalizeMediaType(value: string | undefined): TweetMedia["type"] {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "VIDEO" || normalized === "GIF") {
    return normalized;
  }
  return "PHOTO";
}

function normalizeTweet(record: JsonRecord, fetchedAt: string, depth = 0): Tweet | null {
  const source = isRecord(record.tweet) ? record.tweet : record;
  const id = firstString(source, ID_KEYS);
  const text = firstString(source, TEXT_KEYS);

  if (!id || !text) {
    return null;
  }

  const author = normalizeAuthor(source);
  const createdAt = normalizeDate(firstString(source, CREATED_KEYS), fetchedAt);
  const url = firstString(source, ["url", "tweet_url", "tweetUrl", "link"])
    ?? `https://x.com/${author.username === "unknown" ? "i" : author.username}/status/${id}`;
  const type = firstString(source, ["type", "tweet_type", "tweetType"])?.toLowerCase();
  const quotedSource = depth === 0 && isRecord(source.quoted_tweet) ? normalizeTweet(source.quoted_tweet, fetchedAt, 1) : null;

  return {
    id,
    text,
    author,
    created_at: createdAt,
    url,
    metrics: normalizeMetrics(source),
    is_retweet: toBoolean(source.is_retweet ?? source.isRetweet) || type === "retweet",
    is_quote: toBoolean(source.is_quote ?? source.isQuote ?? source.is_quote_status) || type === "quote" || quotedSource !== null,
    is_reply: toBoolean(source.is_reply ?? source.isReply) || type === "reply",
    lang: firstString(source, ["lang", "language"]),
    media: normalizeMedia(source),
    entities: normalizeEntities(source),
    quoted_tweet: quotedSource ?? undefined,
    reply_to_id: firstString(source, ["reply_to_id", "replyToId", "in_reply_to_id", "conversation_id"]),
  };
}

export function parseTweetClawExport(content: string, fetchedAt = new Date().toISOString()): RawTweetsFile {
  const trimmed = content.trim();
  const records = parseJsonRecords(trimmed)
    ?? parseJsonlRecords(trimmed)
    ?? parseCsvRecords(trimmed);
  const tweets = records
    .map((record) => normalizeTweet(record, fetchedAt))
    .filter((tweet): tweet is Tweet => tweet !== null);

  return {
    fetched_at: fetchedAt,
    tweets,
  };
}
