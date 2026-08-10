# 04 — Features (v2 product surface)

Visual/CSS: **complete retain** of shell, sidebar dynamics, tweet cards, density, palette.  
Logic: MVVM on React Router SPA.

## 1. Navigation (target)

```
Dashboard
Watchlists              (dynamic)
Groups                  (dynamic)
Integrations
  └─ zhe.to             (full keep)
AI Settings             (standalone — not buried)
Settings
  ├─ General
  └─ Push tokens        (mint / revoke / labels)
```

**Removed**: Explore, My Account, Usage, Webhooks.

**Auth**: no app Google button required; user arrives via **CF Access**. Optional minimal `/unauthorized` if JWT email rejected.

## 2. Dashboard

| Block | Data |
|-------|------|
| Watchlist / member counts | aggregates |
| Items in last 24h | `items` by created_at |
| Pending AI | translated_text IS NULL |
| Mix breakdown | counts by source_type (optional chip) |
| Recent ingest_logs | last N push batches |

**VM**: `DashboardVm`.

## 3. Watchlists (core)

### List `/watchlist`

- CRUD, icons, `?new=1`
- Show last ingest time / item counts if available

### Detail `/watchlist/:id`

| Capability | Behavior |
|------------|----------|
| Members | x.com usernames (+ tags/notes); used to label/filter pushes |
| Timeline | **mixed** `items` ordered by `created_at`; filter chips: All / x.com / custom |
| Cards | tweet-card for `x.post`; custom card for `custom` |
| Translate / Summary | batch AI; progress UI |
| Push helper | show watchlist id + sample curl (token never shown twice) |
| Logs | ingest_logs for this WL |
| **No** auto-refresh / pull-from-network button | |

### API

```
GET/POST     /api/watchlists
GET/PATCH/DELETE /api/watchlists/:id
GET/POST/DELETE  /api/watchlists/:id/members…
GET          /api/watchlists/:id/items?source_type=&since=
POST         /api/watchlists/:id/translate
GET          /api/watchlists/:id/logs
```

### Acceptance

1. Create WL → mint push token → push x.com + custom items → both appear in one timeline.
2. Filter by source_type works.
3. AI fills translated_text + summary_text when configured.
4. Tenant isolation: other user’s WL id → 404.

## 4. Groups

Unchanged intent: organize identities; bulk import; add into watchlist.  
No ingest root.

## 5. Integrations — zhe.to (**full keep**)

- Page `/integrations/zheto`
- Configure zhe.to credential
- From item/tweet card: “Save to zhe.to”
- Port existing UX/API behavior from v1 without TweAPI

## 6. AI Settings (standalone)

Route: `/ai-settings` (nav item distinct).

| Capability | Notes |
|------------|-------|
| Provider select | multi-provider registry (gecko / `@nocoo/next-ai` model) |
| API key | mask on read; write-only update |
| baseURL / model / sdk type | custom providers |
| Prompt templates | translation + summary |
| Test connection | server-side probe |

Worker uses same config for translate/summary jobs.

## 7. Settings + Push tokens

### General Settings `/settings`

- Profile read-only (email from Access)
- Display prefs if any
- Retention / window hours (optional)

### Push tokens `/settings/tokens` (or section on settings)

| Action | Behavior |
|--------|----------|
| List | label, prefix, created, last_used, scopes — **never** full secret |
| Create | label → show full token **once** + copy |
| Revoke | soft revoke |

**Security**: create/revoke require CF Access session only (bat cli_tokens rules).

## 8. UI porting checklist

| v1 | v2 |
|----|----|
| layout/shell/sidebar | keep; drop Explore/My Account/Usage/Webhooks entries |
| tweet-card | keep; bind CanonicalItem x.post |
| watchlist/groups pages | VM split |
| ai-settings | keep as standalone |
| integrations/zheto | keep |
| login Google button | replace with Access-aware empty/loading or remove |
| new | custom item card; push tokens page; source filter chips |

## 9. Settings keys (initial)

```
ai.*                          # provider, key, model, prompts…
ingest.windowHours            # default 24
integrations.zheto.*
```
