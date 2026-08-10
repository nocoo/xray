# 03 — Data Model & Ingest

## 1. Principles

1. Every feed item has **`source_type`** + **`external_id`** (unique per watchlist).
2. **Push-first** via versioned API on **ingest hostname** (see 02 XR-01).
3. One watchlist = one timeline; **mix** sources allowed.
4. **Discriminated unions** only — invalid `source_type`/`body.kind` pairs rejected.
5. AI annotations are separate columns/status; never mutate source payload.
6. No TweAPI.

## 2. Source types

```ts
export const SOURCE_TYPES = ["x.com", "custom"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
```

| source_type | body.kind | Producer |
|-------------|-----------|----------|
| `x.com` | `x.post` only | twitter-cli-like, etc. |
| `custom` | `custom` only | hermes, scripts |

## 3. Canonical item — discriminated union (XR-04)

```ts
// packages/shared/src/item.ts
export type CanonicalItem = CanonicalXItem | CanonicalCustomItem;

type ItemBase = {
  external_id: string;       // 1..128 chars [A-Za-z0-9._:-]
  created_at: string;        // must be UTC RFC3339 with Z, e.g. 2026-08-10T12:00:00.000Z
  author?: ItemAuthor;
  meta?: Record<string, unknown>; // ≤ 8 KiB JSON
};

export type ItemAuthor = {
  id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string; // https only
};

export type CanonicalXItem = ItemBase & {
  source_type: "x.com";
  body: {
    kind: "x.post";
    tweet: XTweet;
    includes?: {
      tweets?: XTweet[];
      users?: XUser[];
      media?: XMedia[];
    };
  };
};

export type CanonicalCustomItem = ItemBase & {
  source_type: "custom";
  body: {
    kind: "custom";
    title?: string;          // ≤ 500
    text: string;            // 1..20000; markdown subset, no raw HTML
    url?: string;            // https only
    tags?: string[];         // ≤ 20 tags, each ≤ 64
  };
};
```

### X API v2 subset (complete for MVP)

```ts
export type XTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string; // RFC3339 Z if present
  conversation_id?: string;
  in_reply_to_user_id?: string;
  lang?: string;
  possibly_sensitive?: boolean;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
  entities?: {
    urls?: Array<{
      start: number; end: number; url: string;
      expanded_url?: string; display_url?: string;
    }>;
    mentions?: Array<{ start: number; end: number; username: string; id?: string }>;
    hashtags?: Array<{ start: number; end: number; tag: string }>;
    cashtags?: Array<{ start: number; end: number; tag: string }>;
  };
  attachments?: { media_keys?: string[]; poll_ids?: string[] };
  referenced_tweets?: Array<{
    type: "retweeted" | "quoted" | "replied_to";
    id: string;
  }>;
  note_tweet?: { text: string };
  edit_history_tweet_ids?: string[];
};

export type XUser = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  description?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
  verified?: boolean;
  protected?: boolean;
};

export type XMedia = {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
};
```

Runtime: zod/valibot schemas in `@xray/shared` mirror these types; reject unknown `source_type`/`kind` pairs with item error `schema_mismatch`.

### Time normalization (XR-17)

- Parse `created_at` strictly; convert to UTC.
- Store **both** `created_at_ms INTEGER` (sort/filter) and optional original string in payload.
- Reject invalid timestamps and timestamps > now+5m.

## 4. D1 schema (normative constraints — XR-15)

### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  access_iss TEXT NOT NULL,
  access_sub TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT,
  image TEXT,
  created_at_ms INTEGER NOT NULL,
  UNIQUE (access_iss, access_sub),
  UNIQUE (email)
);
```

### push_tokens

```sql
CREATE TABLE push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scopes TEXT NOT NULL,              -- JSON array string, must include ingest:push when used
  created_at_ms INTEGER NOT NULL,
  last_used_at_ms INTEGER,
  revoked_at_ms INTEGER
);
CREATE INDEX push_tokens_user_idx ON push_tokens(user_id);
```

### watchlists

```sql
CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'eye',
  translate_enabled INTEGER NOT NULL DEFAULT 1 CHECK (translate_enabled IN (0, 1)),
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX watchlists_user_idx ON watchlists(user_id);
```

### Source-aware members (XR-05)

```sql
CREATE TABLE watchlist_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('x.com', 'custom')),
  -- stable id in source (twitter user id, hermes agent id, …); nullable until resolved
  external_author_id TEXT,
  handle TEXT,                     -- @username or custom handle
  display_name TEXT,
  note TEXT,
  added_at_ms INTEGER NOT NULL,
  UNIQUE (watchlist_id, source_type, handle)
);
CREATE INDEX watchlist_members_wl_idx ON watchlist_members(watchlist_id);
```

**v1 migration map**: `twitter_username` → `source_type='x.com'`, `handle=username`, `external_author_id=twitter_id`.

### tags / watchlist_member_tags

Unchanged ownership; FK cascade on member/tag delete.

### groups / group_members

```sql
-- groups: same as watchlists ownership pattern
CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('x.com', 'custom')),
  external_author_id TEXT,
  handle TEXT,
  display_name TEXT,
  added_at_ms INTEGER NOT NULL,
  UNIQUE (group_id, source_type, handle)
);
```

### items

```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('x.com', 'custom')),
  external_id TEXT NOT NULL,
  member_id INTEGER REFERENCES watchlist_members(id) ON DELETE SET NULL,
  author_username TEXT,
  title TEXT,
  text TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  ingested_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  ai_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (ai_status IN ('not_requested','pending','succeeded','failed')),
  translated_text TEXT,
  summary_text TEXT,
  translation_error TEXT,
  UNIQUE (watchlist_id, source_type, external_id)
);
CREATE INDEX items_wl_created_idx ON items(watchlist_id, created_at_ms DESC, id DESC);
CREATE INDEX items_user_created_idx ON items(user_id, created_at_ms DESC);
```

### ingest_logs

```sql
CREATE TABLE ingest_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE SET NULL,
  attempted INTEGER NOT NULL,
  accepted INTEGER NOT NULL,
  deduped INTEGER NOT NULL,
  rejected INTEGER NOT NULL,
  errors_json TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX ingest_logs_wl_idx ON ingest_logs(watchlist_id, created_at_ms DESC, id DESC);
```

### settings / ai_configs

Key-value or dedicated ai_configs with **encrypted** secret fields (02 §7).

## 5. Push API (versioned)

### `POST /api/v1/ingest/push` (ingest host only)

**Auth**: Bearer push token.

**MVP accepts canonical items only** (XR-19). No raw/tweapi blobs.

```json
{
  "watchlist_id": 1,
  "items": [ /* CanonicalItem[] */ ],
  "options": {
    "apply_window_hours": 24
  }
}
```

### Window priority (XR-18)

1. If `options.apply_window_hours` is a number **0..168** → use it.  
2. Else user setting `ingest.windowHours` default **24**.  
3. **`null` is not allowed** from clients to mean “unlimited” unless token scope includes `ingest:push:unbounded` (not granted by default mint).  
4. Window-rejected items count as `rejected` with code `outside_window`.

### Dedupe / upsert (XR-16) — locked

| Case | Behavior |
|------|----------|
| New key | INSERT |
| Existing `(watchlist_id, source_type, external_id)` | **insert-ignore** (no payload overwrite; preserve AI fields). Count as `deduped`. |
| Want update | future `options.mode=replace` — **not MVP** |

### Partial success (XR-16)

- HTTP **200** if request authenticated and parsed; body:

```json
{
  "ok": true,
  "accepted": 1,
  "deduped": 1,
  "rejected": 1,
  "errors": [
    { "index": 2, "code": "schema_mismatch", "message": "…" }
  ]
}
```

- HTTP **401** bad token; **403** wrong scope; **404** watchlist; **413** body too large; **429** rate limit.
- Per-item failures do not roll back accepted inserts (item-level transactions).

### Response + list pagination (XR-09)

```
GET /api/watchlists/:id/items?limit=50&cursor=...&source_type=
```

- `limit` default 50, max 100.
- Cursor opaque; order `(created_at_ms DESC, id DESC)`.
- Response: `{ items, next_cursor }`.

Same pattern for `GET /api/watchlists/:id/logs`.

## 6. Pipeline

```
pushTokenAuth → size/rate limits → parse v1 envelope
  → for each item: schema (discriminated) → time normalize → window
  → match member (source_type + handle/author)
  → INSERT OR IGNORE items
  → ingest_logs
  → do not auto-AI
```

## 7. Watchlist membership vs mix

| Scenario | Members | Items |
|----------|---------|-------|
| Pure x.com | source_type=x.com handles | pushes x.com |
| Pure custom | optional custom handles | pushes custom |
| Mix | both | both; UI filter chips |

## 8. API surface

| Method | Path | Host | Auth |
|--------|------|------|------|
| POST | `/api/v1/ingest/push` | **ingest** | Bearer |
| GET | `/api/watchlists/:id/items` | browser | Access |
| POST | `/api/watchlists/:id/translate` | browser | Access |
| GET/POST | `/api/push-tokens` | browser | Access |
| DELETE | `/api/push-tokens/:id` | browser | Access |
| GET | `/api/live` | both | public |

## 9. TweAPI purge check

```bash
rg -i 'tweapi' --glob '!docs/legacy/**' --glob '!legacy/**' --glob '!**/node_modules/**'
# must be 0
```
