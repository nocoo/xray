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
| P5 | **Two credentials** — twitter-cli cookies (read X) ≠ X-Ray push token (ingest **auth**: graph read + push write). Browser Access is not required to refresh. |
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

Default: same Bearer token and same ingest base as push (BD-10, XR-29).

```http
GET /api/v1/ingest/graph
Authorization: Bearer xray_pt_…
```

| Mode | How |
|------|-----|
| **A. Live token graph (always first)** | Every start — including `--dry-run`, `--cache-only`, `--from-cache` — `GET {ingest}/api/v1/ingest/graph` with the same token+base as push. 401/403/429/network/bad JSON **fail closed**. No snapshot/cache fallback. |
| **B. Snapshot override (after live)** | **Only** CLI `--members-file PATH` when that file exists. Ids must belong to that ingest D1. Not `XRAY_MEMBERS_FILE`, not default `config/members.json`. |

**Removed**: `XRAY_BROWSER_BASE`, `XRAY_CF_AUTHORIZATION`, default `config/members.json`, env `XRAY_MEMBERS_FILE` as graph sources.

### Env → ingest base

| Mode | `XRAY_INGEST_BASE` (or `--ingest-base` / `--env`) |
|------|---------------------------------------------------|
| Prod | `https://xray-ingest.hexly.ai` |
| Dev / local | `http://127.0.0.1:8787` (wrangler `--env development`) |

Script may accept `--env prod|dev` as sugar for the row above. Graph and push **must** share that base so ids cannot cross environments.

`--from-cache` still **live-fetches the graph** first; it only skips twitter-cli raw refetch. Empty `{watchlists:[]}` is a successful no-op (parser must accept empty arrays).

Snapshot schema (same as graph JSON, wrapped for `parseMembersGraph`):

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

### Push token storage (global, not git)

| Path | Role |
|------|------|
| **`~/.config/xray/push.env`** | **Canonical** secret file (`chmod 600`). Contains `XRAY_PUSH_TOKEN`, default prod `XRAY_INGEST_BASE`, optional knobs. |
| `.xray-push.env` (repo root) | Optional pointer note only — **gitignored** (`*.push-token`, `.xray-push.env`). Never put the real token in-repo. |

Mint / reset (ops): UI **Settings → Push tokens**, or wrangler D1 insert of `mintPushToken()` hash for the prod user, then rewrite `~/.config/xray/push.env`.

```bash
# 0. Preconditions
twitter status --json          # authenticated
set -a && source ~/.config/xray/push.env && set +a   # loads XRAY_PUSH_TOKEN (+ prod defaults)

# 1. Target (graph + push share this base)
export XRAY_INGEST_BASE=https://xray-ingest.hexly.ai   # prod
# export XRAY_INGEST_BASE=http://127.0.0.1:8787        # local/dev

# 2. Optional knobs (push.env may already set these)
export XRAY_WINDOW_HOURS=24
export XRAY_TWITTER_MAX=20          # natural page; do not crank to “fill”
export XRAY_CACHE_DIR=.cache/twitter-cli
export TWITTER_BIN=twitter

# 3. Run (pacing: docs/10-refresh-schedule.md — default 60min spread)
bun run refresh:watchlists -- --help
bun run refresh:watchlists -- --dry-run     # resolve graph + schedule preview
bun run refresh:watchlists -- --cache-only  # fetch+cache+convert, no push
bun run refresh:watchlists --               # full: 60min spread → cache → convert → push
bun run refresh:watchlists -- --from-cache  # offline: reuse raw JSON only, convert + push
bun run refresh:watchlists -- --refresh-mode incremental
```

Scheduling details (epoch, min-gap, 429 defer): **[10-refresh-schedule.md](10-refresh-schedule.md)**.

Pipeline stages:

```
resolve graph → unique handles (^[A-Za-z0-9_]{1,15}$)
  → twitter user-posts (usually once per handle; 429 may defer **one** retry in-epoch) → .cache/twitter-cli/raw/<handle>.json
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
| Single handle rate-limit | Default **60m spread**: pause **120–300s** (capped by remaining epoch), **rebase** queue, **defer once** later in-epoch; recovered 429 exits 0. Second failure / epoch over → partial exit 1. Do not dense multi-retry (twitter-cli already retried 3×). See [10-refresh-schedule.md](10-refresh-schedule.md). |
| Single handle 404 / other | Log + continue (partial, exit 1) |
| Convert skip | Counted in `skipped`; not POSTed |
| Ingest 401 | Bad/revoked `XRAY_PUSH_TOKEN` |
| Ingest 404 watchlist | Token user ≠ WL owner or wrong id (e.g. e2e seed lists) — filter snapshot to your `user_id` |
| Outside window | Server `outside_window` / client pre-filter |
| Empty members | No-op success with zero pushes |
| Overlapping cron | `epoch.lock` flock → **exit 3**; wait for the other run. **Do not rm** the lock file (permanent path; flock auto-releases when holder exits) |

**Rate limits (prod cookie/GraphQL path):** use the default **60-minute spread** (`--spread-window-min 60`, `--min-gap-ms 12000`). Do **not** prefer `--handle-delay-ms 3000` — that flag forces `--no-spread` legacy sprint and recreates 429 storms. Do not raise `--max` to “fill” a window — that only burns quota.

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
| `config/members.json` | optional snapshot override only (gitignored via `config/`) |

---

## 9. Success criterion (operator)

One full-window run over **all** watchlists that have x.com members finishes (exit 0 or documented partial). For each list with in-window source data, `GET /api/watchlists/:id/items` (or UI timeline) shows posts (`accepted + deduped > 0` when raw cache had in-window tweets).
