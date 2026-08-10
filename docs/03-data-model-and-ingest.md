# 03 — Data Model & Ingest

## 1. Principles

1. **Every feed item has a `source_type`** (and stable `external_id` within that source).
2. **Push-first**: platform does not schedule pulls; producers call ingest API.
3. **One watchlist = one timeline** that may **mix** source types.
4. Canonical payload for `x.com` ≈ **X API v2 Tweet envelope**; other sources use typed payloads under the same item envelope.
5. AI annotations hang off stored items; never mutate source payload in place.
6. **No TweAPI** types, fields, or adapters.

## 2. Source types

```ts
// packages/shared/src/source.ts
export const SOURCE_TYPES = [
  "x.com",     // Twitter/X posts (canonical XTweet)
  "custom",    // free-form agent/hermes notes, links, markdown
  // future: "rss", "github", ...
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
```

| source_type | Producer examples | Payload |
|-------------|-------------------|---------|
| `x.com` | twitter-cli-like scraper, future X API pull | `CanonicalXPost` (tweet + includes) |
| `custom` | hermes agent, manual scripts, internal bots | `CanonicalCustomItem` |

Extensibility: add enum value + normalizer + UI card variant; watchlist needs no schema fork.

## 3. Canonical item envelope

```ts
// packages/shared/src/item.ts
export type CanonicalItem = {
  /** Discriminator */
  source_type: SourceType;
  /**
   * Stable id from producer within source_type.
   * x.com → tweet id; custom → producer-generated ulid/uuid
   */
  external_id: string;
  /** ISO 8601 — used for 24h window & sort */
  created_at: string;
  /** Optional routing hints from producer */
  author?: {
    id?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
  };
  /** Source-specific body */
  body: XPostBody | CustomBody;
  /** Free-form producer metadata (not indexed) */
  meta?: Record<string, unknown>;
};

export type XPostBody = {
  kind: "x.post";
  tweet: XTweet;           // see §4 — X API v2 shaped
  includes?: {
    tweets?: XTweet[];
    users?: XUser[];
    media?: XMedia[];
  };
};

export type CustomBody = {
  kind: "custom";
  title?: string;
  text: string;            // markdown or plain
  url?: string;
  tags?: string[];
};
```

**UI**: timeline renders by `body.kind` — tweet-card for `x.post`, generic card for `custom` (visual system still uses shared tokens).

## 4. X API v2 tweet shape (`source_type = x.com`)

Same subset as previously specified (`XTweet`, `XUser`, `XMedia`) — wire **snake_case**, stored in `payload_json`.  
Normalizers from twitter-cli / other scrapers **must** emit this shape before or at the Worker boundary.

## 5. D1 schema (logical)

### Identity (Access-backed)

- `users` — id, email (from Access), name, image, created_at  
- No Google `accounts` table required if Access is sole IdP (email stable). Optional `access_sub` column.

### Push tokens

```sql
push_tokens (
  id INTEGER PK,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scopes TEXT NOT NULL,          -- e.g. 'ingest:push'
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
)
```

### Product

- `watchlists` — id, user_id, name, description, icon, translate_enabled, created_at  
  - optional: `default_source_type` (hint only; mix still allowed)
- `watchlist_members` — for **x.com** (and similar identity-based sources): username, twitter_id, note, tags  
  - **custom** sources may have zero members; items target watchlist_id directly on push
- `tags` / `watchlist_member_tags`
- `groups` / `group_members`
- `settings` / `ai_configs`
- `integrations_zheto` or settings keys for zhe.to

### `items` table (replaces fetched_posts)

| Column | Notes |
|--------|------|
| id | PK |
| user_id | tenant |
| watchlist_id | timeline owner |
| source_type | `x.com` \| `custom` \| … |
| external_id | unique with watchlist + source_type |
| author_username | denorm nullable |
| title | nullable (custom) |
| text | primary display text |
| created_at | ISO from item |
| ingested_at | server time |
| payload_json | full CanonicalItem |
| translated_text | AI |
| summary_text | AI |
| translation_error | |
| member_id | nullable FK — set when matched to watchlist_members |

Unique: `(watchlist_id, source_type, external_id)`.

Indexes: `(watchlist_id, created_at DESC)`, `(user_id, created_at)`.

### fetch_logs → `ingest_logs`

Record push batches: attempted/succeeded/deduped/errors (not “provider pull”).

## 6. Push API

### `POST /api/ingest/push`

**Auth**: `Authorization: Bearer <push_token>` (Access not required).

```json
{
  "watchlist_id": 1,
  "items": [
    {
      "source_type": "x.com",
      "external_id": "1234567890",
      "created_at": "2026-08-10T12:00:00.000Z",
      "author": { "username": "alice", "id": "..." },
      "body": {
        "kind": "x.post",
        "tweet": { "id": "1234567890", "text": "hello", "created_at": "..." },
        "includes": {}
      }
    },
    {
      "source_type": "custom",
      "external_id": "01JABC...",
      "created_at": "2026-08-10T12:05:00.000Z",
      "author": { "display_name": "hermes" },
      "body": {
        "kind": "custom",
        "title": "Daily brief",
        "text": "…",
        "url": "https://…",
        "tags": ["hermes"]
      }
    }
  ],
  "options": {
    "apply_window_hours": 24,
    "skip_ai": false
  }
}
```

**Response**:

```json
{
  "ok": true,
  "accepted": 2,
  "deduped": 0,
  "rejected": 0,
  "errors": []
}
```

### Rules

- Token → `user_id`; `watchlist_id` must belong to that user.
- Max batch size (e.g. 100) enforced.
- Invalid item → per-item error, not whole batch fail (partial success).
- Dedupe on unique key.
- `apply_window_hours`: if set, drop items older than window (default 24; `null` = keep all).
- AI runs async or inline small batches if `translate_enabled && !skip_ai`.

### Producer contract (CLI / hermes)

1. Authenticate with push token from Settings UI.
2. Emit **CanonicalItem[]** (preferred) or raw + `source_type` if server normalizer exists.
3. Target `watchlist_id` (required in MVP).

Optional helper script in repo later: `scripts/push-from-twitter-cli.ts` — **not** blocking core.

## 7. Pipeline (server)

```
pushTokenAuth
  → parse envelope
  → for each item: validate source_type + body.kind
  → normalize (identity for already-canonical; adapters for known raw forms)
  → WindowGate (optional)
  → resolve member_id if x.com username matches watchlist_members
  → upsert items
  → ingest_logs
  → optional AI annotate
```

### Ports (future pull — not MVP)

```ts
interface TweetSource {
  readonly id: string;
  readonly sourceType: SourceType;
  fetch?(...): Promise<CanonicalItem[]>;
}
```

MVP implements **only** push ingress + normalizers. No `fetch()` scheduling.

## 8. Watchlist membership vs mix

| Scenario | How |
|----------|-----|
| Pure x.com list | members = accounts; producers push tweets for those users into WL |
| Pure custom / hermes | no members required; agent pushes `custom` items to WL id |
| **Mix** | members for x.com identities **and** custom items same `watchlist_id`; timeline `ORDER BY created_at DESC` |

UI filters: chip filter by `source_type` on detail page.

## 9. API surface (ingest-related)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/ingest/push` | push token |
| GET | `/api/watchlists/:id/items` | Access |
| POST | `/api/watchlists/:id/translate` | Access |
| GET/POST/DELETE | `/api/push-tokens` | Access |
| GET | `/api/live` | public or Access |

**Removed**: provider pull refresh that called TweAPI; server cron refresh.

Note: UI “Refresh” button in v1 meant pull-from-provider — **v2 either removes it or repurposes** to “re-run AI on pending” / “show push instructions”. Prefer **remove pull refresh**; keep **Translate**.

## 10. Explicit non-goals

- Storing Explore graphs / DMs / bookmarks
- Migrating old `fetched_posts`
- Platform-initiated X scraping
- Webhooks outbound product (push tokens ≠ webhooks UI)
