# 09 — Local producer: twitter-cli → ingest push

Local, script-first producer that refreshes **x.com** members on all watchlists in one natural window, then POSTs canonical items to the ingest host.

**Non-goals**: Worker-side pull, CF Cron, historical v1 posts, multi-tenant token UX.

---

## 1. Principles

| # | Rule |
|---|------|
| P1 | **Flexible window** — modest `--max` (default 20). We do **not** add our own cursor loop. Note: upstream twitter-cli may issue multiple GraphQL pages until it reaches `--max`; keep max small so that stays near one natural page. |
| P2 | **Raw cache independent** — twitter-cli JSON stays on disk under `.cache/twitter-cli/`; never sent raw to X-Ray. |
| P3 | **Convert at push** — mapper turns each tweet into `source_type=x.com` / `body.kind=x.post`; only `parseCanonicalItem`-valid items are POSTed. |
| P4 | **Script-primary** — `bun run refresh:watchlists` is the stable entry; agents only orchestrate the same script. |
| P5 | **Dual auth** — twitter-cli cookies (read X) ≠ X-Ray push token (write ingest) ≠ browser session (list WLs). |
| P6 | **Minimal vendor boundary** — orchestrator only sees `XTimelineSource`; twitter-cli JSON/CLI never leak into Worker or generic producer code. |

---

## 1.1 Data boundary (replaceability)

```
                    ┌─────────────────────────────────────┐
  orchestrator      │  scripts/refresh-watchlists.ts      │
  (source-agnostic) │  graph · window · batch · ingest    │
                    └──────────────┬──────────────────────┘
                                   │ XTimelineSource only
                                   │  ready()
                                   │  fetchHandle(handle) → { items: CanonicalItem[], raw: opaque }
                                   │  parseCachedRaw(raw) → { items, skipped }
                    ┌──────────────▼──────────────────────┐
  adapter           │  createTwitterCliSource()           │
  (vendor-private)  │  spawn · map · env scrub · errors   │
                    └──────────────┬──────────────────────┘
                                   │ CLI + vendor JSON only here
                                   ▼
                            twitter-cli binary
```

### What may cross the boundary

| Direction | Payload | Notes |
|-----------|---------|--------|
| → adapter | `handle` string, `max` hint | normalized x.com username |
| ← adapter | `CanonicalItem[]` | already `parseCanonicalItem`-valid |
| ← adapter | `skipped[]` | mapper drops, not ingest errors |
| ← adapter | `raw: unknown` | **opaque** cache blob; never POST |
| → adapter | cached `raw` | round-trip only via `parseCachedRaw` |

### What must NOT cross

- `screenName`, `createdAtISO`, `metrics.likes`, envelope `schema_version`, …
- Direct `twitter status` / `user-posts` calls from the script
- `mapTwitterCli*` imports outside the adapter module
- Raw vendor JSON on `POST /api/v1/ingest/push`

### Module map

| Layer | Modules |
|-------|---------|
| Core (keep when swapping source) | `producer-core` (window/batch), `producer-utils` (graph/url/exit), `producer-push`, `canonical-item`, `x-timeline-source` |
| twitter-cli adapter (delete/replace together) | `twitter-cli-source`, `twitter-cli-map`, `producer-spawn` (+ TWITTER_* env scrub) |
| Entry | `scripts/refresh-watchlists.ts` — only `createTwitterCliSource` as vendor line |

### Swap recipe

1. Implement `XTimelineSource` for the new reader (e.g. official API, another CLI).
2. In `refresh-watchlists.ts`, replace `createTwitterCliSource(...)` with the new factory.
3. Point cache dir at `.cache/<source.id>/` (or `XRAY_CACHE_DIR`).
4. Delete or stop exporting `twitter-cli-*` modules when unused.

---

## 2. twitter-cli principle (read path)

Binary: `twitter` ([reference tree](../../../reference/twitter-cli) / PyPI `twitter-cli`).

### Auth (twitter side)

Priority:

1. `TWITTER_AUTH_TOKEN` + `TWITTER_CT0`
2. Browser cookie extraction (Arc/Chrome/Edge/Firefox/Brave) — preferred for full cookie jar

Check:

```bash
twitter status --json   # data.authenticated === true
```

### Fetch command

```bash
twitter user-posts <handle> --json --max <N>
# optional: -o .cache/twitter-cli/raw/<handle>.json
```

Envelope (`SCHEMA.md`):

```json
{
  "ok": true,
  "schema_version": "1",
  "data": [ /* Tweet objects */ ],
  "pagination": { "nextCursor": "…" }
}
```

### Tweet object (raw — independent of X-Ray)

Key fields from `tweet_to_dict`:

| twitter-cli | notes |
|-------------|--------|
| `id`, `text` | required |
| `author.id`, `author.screenName`, `author.name`, `author.profileImageUrl` | camelCase |
| `metrics.likes/retweets/replies/quotes/views/bookmarks` | not X v2 names |
| `createdAtISO` | often `…+00:00` — **must** become RFC3339 `Z` before ingest |
| `createdAt` | Twitter string fallback if ISO missing |
| `media[]` | `{ type, url, width, height }` — no `media_key` |
| `isRetweet`, `retweetedBy`, `quotedTweet` | optional refs |
| `lang` | optional |

**Window policy**: one `user-posts` invocation per unique handle; client-side (and/or ingest `apply_window_hours`) drops older items. Do **not** implement our own `nextCursor` loop. Prefer `--max 20` (≈ one timeline page). Upstream CLI may still page internally up to `--max` — that is intentional capping, not “pad until window full”.

---

## 3. Map → canonical (`@xray/shared`)

Shipped mapper: `mapTwitterCliTweetToCanonical` / `mapTwitterCliEnvelope`.

| Canonical field | Source |
|-----------------|--------|
| `source_type` | `"x.com"` |
| `external_id` | tweet `id` as **string** (or safe integer → string); unsafe numbers rejected |
| `created_at` | `toRfc3339Z(createdAtISO \|\| createdAt)` → `Date.toISOString()` |
| `author.id` | `author.id` (same id rules) |
| `author.username` | `author.screenName` (normalized lower) |
| `author.display_name` | `author.name` |
| `author.avatar_url` | `profileImageUrl` with `http→https` if needed; drop if not https |
| `body.kind` | `"x.post"` |
| `body.tweet.id/text` | same |
| `body.tweet.author_id` | `author.id` |
| `body.tweet.created_at` | same Z timestamp |
| `body.tweet.lang` | `lang` if non-empty |
| `body.tweet.public_metrics` | likes→like_count, retweets→retweet_count, … |
| `body.tweet.referenced_tweets` | **quoted** only when `quotedTweet.id` present (plain retweets often lack original id in twitter-cli) |
| `body.includes.users[0]` | author as XUser |
| `body.includes.media` | synthetic `media_key` `m0…`; type photo\|video\|animated_gif only |
| `body.tweet.attachments.media_keys` | matching keys |
| `meta.producer` | `"twitter-cli"` |

Bad rows → `{ ok: false, reason }` — skipped; batch continues.

---

## 4. Ingest push (write path)

**Host**: `https://xray-ingest.hexly.ai` (or `XRAY_INGEST_BASE`).  
**Auth**: `Authorization: Bearer <xray_pt_…>` only (`XRAY_PUSH_TOKEN`).  
**Not** Access JWT. Single-operator fixed token is expected.

```http
POST /api/v1/ingest/push
Content-Type: application/json
Authorization: Bearer xray_pt_…

{
  "watchlist_id": 1,
  "items": [ /* ≤50 CanonicalItem */ ],
  "options": { "apply_window_hours": 24 }
}
```

- Max **50** items/request — script chunks.
- Window: prefer `options.apply_window_hours` (1–168) aligned with operator intent; else server user setting.
- Dedupe: insert-ignore on `(watchlist_id, source_type, external_id)`.

---

## 5. Listing watchlists / members (graph path)

Push token **cannot** call browser CRUD. Graph resolution needs one of:

| Mode | How |
|------|-----|
| **A. Browser API** | `GET /api/watchlists` + `GET /api/watchlists/:id/members` on browser/worker base with Access or dev bypass |
| **B. Snapshot file** | `XRAY_MEMBERS_FILE=path.json` written once (export or hand-maintained) |

### Browser API auth

| Env | Use |
|-----|-----|
| Local worker | `XRAY_BROWSER_BASE=http://127.0.0.1:8787` + `AUTH_DEV_BYPASS` (default wrangler development). Script sends `Host: localhost` + `Origin: http://localhost:7007`. |
| Prod | `XRAY_BROWSER_BASE=https://xray.hexly.ai` + `XRAY_CF_AUTHORIZATION=<CF_Authorization cookie value>` (Access JWT cookie after browser login). |
| Snapshot | Skip browser entirely. |

Snapshot schema:

```json
{
  "watchlists": [
    {
      "id": 1,
      "name": "AI",
      "members": [
        { "handle": "sama", "sourceType": "x.com" }
      ]
    }
  ]
}
```

Only `sourceType === "x.com"` members are fetched.

---

## 6. Operator command flow

```bash
# 0. Preconditions
twitter status --json          # authenticated
export XRAY_PUSH_TOKEN=xray_pt_…   # mint once in UI → Settings → Push tokens

# 1. Graph (pick one)
export XRAY_BROWSER_BASE=http://127.0.0.1:8787   # local bypass
# or
export XRAY_MEMBERS_FILE=./config/members.json
# or prod:
# export XRAY_BROWSER_BASE=https://xray.hexly.ai
# export XRAY_CF_AUTHORIZATION='…'

# 2. Optional knobs
export XRAY_INGEST_BASE=https://xray-ingest.hexly.ai
export XRAY_WINDOW_HOURS=24
export XRAY_TWITTER_MAX=20          # natural page; do not crank to “fill”
export XRAY_CACHE_DIR=.cache/twitter-cli
export TWITTER_BIN=twitter

# 3. Run
bun run refresh:watchlists -- --help
bun run refresh:watchlists -- --dry-run     # resolve graph + plan only (no twitter/no push)
bun run refresh:watchlists -- --cache-only  # fetch+cache+convert, no push
bun run refresh:watchlists --               # full: always re-fetch → cache → convert → push
bun run refresh:watchlists -- --from-cache  # offline: reuse raw JSON only, convert + push
```

Pipeline stages:

```
resolve graph → unique handles (^[A-Za-z0-9_]{1,15}$)
  → twitter user-posts (once per handle; default re-fetch) → .cache/twitter-cli/raw/<handle>.json
  → map envelope → canonical[]
  → filter by windowHours (client)
  → fan-out items to each watchlist that lists that handle
  → chunk ≤50 → POST ingest (retry 429/5xx; 401/403 fatal)
  → print accepted/deduped/rejected per WL; non-zero exit if partial
```

Handle **dedupe across lists**: one fetch; items cloned into each watchlist’s push batches.  
**Cache**: default run always overwrites raw JSON. Only `--from-cache` reuses disk without calling X.

---

## 7. Failure modes

| Symptom | Handling |
|---------|----------|
| **`twitter` not installed / not on PATH** | Preflight (`twitter status`) fails → **exit 2** with install steps (`uv tool install twitter-cli`), `TWITTER_BIN` / `--twitter-bin`, and verify commands |
| **Login missing or cookies expired** | Preflight sees `authenticated !== true` or 401/403/cookie errors → **exit 2** with browser re-login, `TWITTER_AUTH_TOKEN`+`TWITTER_CT0`, and `--from-cache` offline option |
| Mid-run auth failure on a handle | Print same guidance once, **abort remaining handles** (all would fail the same way) |
| Single handle rate-limit | Log + 60s cool-off + continue other handles (partial, exit 1). Do not dense multi-retry (twitter-cli already retried). Resume offline with `--from-cache` for successes; default re-run re-fetches all |
| Single handle 404 / other | Log + continue (partial, exit 1) |
| Convert skip | Counted in `skipped`; not POSTed |
| Ingest 401 | Bad/revoked `XRAY_PUSH_TOKEN` |
| Ingest 404 watchlist | Token user ≠ WL owner or wrong id (e.g. e2e seed lists) — filter snapshot to your `user_id` |
| Outside window | Server `outside_window` / client pre-filter |
| Empty members | No-op success with zero pushes |

**Rate limits**: Prefer `--handle-delay-ms 3000+` for 50+ handles. Do not raise `--max` to “fill” a window — that only burns quota.

---

## 8. Layout

| Path | Role |
|------|------|
| `docs/09-local-producer-twitter-cli.md` | this design + **boundary** |
| `packages/shared/src/x-timeline-source.ts` | **stable** adapter interface |
| `packages/shared/src/producer-core.ts` | window filter + ingest batch (source-agnostic) |
| `packages/shared/src/twitter-cli-source.ts` | **adapter factory** (`createTwitterCliSource`) |
| `packages/shared/src/twitter-cli-map.ts` | vendor JSON → canonical (private to adapter) |
| `packages/shared/src/producer-spawn.ts` | vendor CLI spawn + error copy |
| `packages/shared/src/fixtures/twitter-cli-user-posts.json` | mapper fixtures |
| `scripts/refresh-watchlists.ts` | orchestrator (one vendor import line) |
| `.cache/twitter-cli/` | gitignored opaque raw + run logs |
| `config/members.json` | optional snapshot (gitignored via `config/`) |

---

## 9. Success criterion (operator)

One full-window run over **all** watchlists that have x.com members finishes (exit 0 or documented partial). For each list with in-window source data, `GET /api/watchlists/:id/items` (or UI timeline) shows posts (`accepted + deduped > 0` when raw cache had in-window tweets).
