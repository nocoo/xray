# 04 — Features (v2 product surface)

Visual/CSS: **complete retain**. Logic: MVVM SPA.

## 1. Navigation

```
Dashboard
Watchlists              (dynamic)
Groups                  (dynamic)
Integrations
  └─ zhe.to
AI Settings             (standalone)
Settings
  ├─ General
  └─ Push tokens
```

Removed: Explore, My Account, Usage, Webhooks.  
Auth: CF Access wall on **browser host** `xray.hexly.ai` (dev: `xray.dev.hexly.ai`).

## 2. Dashboard

| Block | Data |
|-------|------|
| Counts | watchlists, members, items 24h |
| Pending AI | count items on `translate_enabled` watchlists with `ai_status IN ('pending','not_requested')` (see 02 AI model) |
| Mix breakdown | by source_type |
| Recent ingest_logs | last N |

## 3. Watchlists

### List + CRUD (XR-10)

Full CRUD on `/watchlist`: create, rename, delete, icon, translate_enabled.  
APIs: `GET/POST /api/watchlists`, `GET/PATCH/DELETE /api/watchlists/:id`.

### Detail `/watchlist/:id`

| Capability | Behavior |
|------------|----------|
| Members | source-aware (source_type + handle); tags/notes |
| Timeline | paginated items; filter All / x.com / custom |
| Cards | tweet-card / custom card (sanitized markdown) |
| Translate | bounded batch ≤20; updates ai_status |
| Push helper | watchlist id + sample curl to **ingest host** |
| Logs | paginated ingest_logs |
| **No** pull refresh / cron | |

### Acceptance

1. Create WL → mint token → push x.com + custom → both on timeline.  
2. Source filter works.  
3. AI fills fields when configured.  
4. Cross-user ids → 404.

## 4. Groups

CRUD + source-aware members + bulk import (x.com handles from Twitter export).  
Add members into a watchlist (copy handles with source_type).

## 5. Integrations — zhe.to full keep (XR-11, R4-03)

**Authority**: port behavior from v1 `src/app/api/integrations/zheto/**` + tweet-card save (now under `legacy/v1` after S1).

### Settings (browser Access)

| Field | Storage (R5-02) |
|-------|---------|
| `webhookUrl` | **entire URL** encrypted in `integration_secrets.ciphertext` only; **never** put token in `meta_json`. Prod allowlist: URL must match `^https://zhe\.to/api/webhook/` ; tests inject mock adapter / override host |
| `folder` | optional ≤50 — plain `settings` or `meta_json` non-secret |

UI: Integrations → zhe.to form (same labels/placeholders as v1).

### Save API

`POST /api/integrations/zheto/save` (browser host, Access)

**Request JSON** (optional fields may be omitted)

```json
{
  "url": "https://x.com/i/status/123",
  "note": "optional note",
  "folder": "optional-folder"
}
```

- `url` required  
- `note` optional, truncated to 500  
- `folder` optional; else default from settings  

**Upstream call** (Worker → zhe.to)

```
POST {webhookUrl}
Content-Type: application/json
Body: { "url": "...", "note"?: "...", "folder"?: "..." }
```

Auth is **path token inside webhookUrl** (no extra Authorization header).

**Success response to client**

```json
{
  "success": true,
  "data": {
    "shortUrl": "https://zhe.to/…"|null,
    "slug": "…"|null,
    "originalUrl": "…",
    "isExisting": true|false
  }
}
```

- Upstream 201 → newly created (`isExisting=false`)  
- Upstream 200 → already existed (`isExisting=true`) — UI shows saved / already saved  
- Upstream 4xx/5xx → proxy error; 5xx → client 502  

**Card UX**: idle → saving → saved | error (auto-clear error 3s); disable double-submit.

**URL derivation for items**

| source | url |
|--------|-----|
| x.com | `https://x.com/i/status/{tweet.id}` (or author/status if preferred) |
| custom | `body.url` required to enable Save button |

### E2E

1. Save settings webhookUrl (mock).  
2. Click Save on timeline card.  
3. Assert mock upstream received exact JSON `{url, note}` shape.  
4. Assert UI reaches `saved`.

## 6. AI Settings (standalone)

`/ai-settings`: multi-provider, masked key, prompts, test connection (gecko patterns).  
Worker uses encrypted secrets for translate/summary.

## 7. Settings + Push tokens

### General (`/settings` — S5 M0.5 / with M0)

Profile (email from Access); `ingest.windowHours` (**1–168**, default 24) via `GET/PATCH /api/settings`.

### Push tokens `/settings/tokens`

| Action | Auth | Behavior |
|--------|------|----------|
| List | Access | label, `token_prefix`, created, last_used — never full secret |
| Create | Access + Origin check | full `xray_pt_…` plaintext **once**; store prefix + SHA-256 hash |
| Revoke | Access | `DELETE /api/push-tokens/:id` |

## 8. UI porting

From `legacy/v1`: shell, sidebar (trimmed nav), tweet-card, zheto, ai-settings chrome.  
New: custom card, tokens page, source chips, ingest-host curl helper.
