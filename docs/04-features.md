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

## 5. Integrations — zhe.to full keep (XR-11)

### Retained v1 behavior contract

| Item | Behavior |
|------|----------|
| Settings | store zhe.to API base + API key (envelope-encrypted) |
| Test | optional ping endpoint |
| Save from card | POST mapped bookmark payload to zhe.to from **item** (x.post URL `https://x.com/i/status/{id}` or custom.url) |
| Success UX | toast success; idempotent re-save → show zhe response / “already saved” if API returns conflict |
| Failure UX | toast error with sanitized message; no key leak |
| Auth | browser Access only |

### E2E

Must cover: configure credential (mock) → save from timeline card → mock zhe API received expected body — not only settings form load.

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
