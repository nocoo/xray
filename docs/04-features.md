# 04 — Features (v2 product surface)

Visual/CSS: **complete retain**. Logic: MVVM SPA.

**Implementation status (2026-08-11):** product surface below is **shipped** on main (API + UI + unit tests). Remaining non-product work (L3 CI depth, KEK reencrypt job, multi-provider AI SaaS, custom-source producer) lives in [07](07-implementation-plan.md) optional backlog — not open product gaps.

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

| Block | Data | Status |
|-------|------|--------|
| Counts | watchlists, members, items 24h | **done** — `packages/worker/src/repos/dashboard.ts`, `packages/ui/src/views/dashboard-page.tsx` |
| Pending AI | count items on `translate_enabled` watchlists with `ai_status IN ('pending','not_requested')` (see 02 AI model) | **done** — same |
| Mix breakdown | by source_type | **done** — same |
| Recent ingest_logs | last N | **done** — `listRecentIngestLogs` in `repos/ingest-logs.ts`; dashboard embeds `recentIngestLogs` |

## 3. Watchlists

### List + CRUD (XR-10)

Full CRUD on `/watchlist`: create, rename, delete, icon, translate_enabled.  
APIs: `GET/POST /api/watchlists`, `GET/PATCH/DELETE /api/watchlists/:id`.

### Detail `/watchlist/:id`

| Capability | Behavior | Status |
|------------|----------|--------|
| Members | source-aware (source_type + handle); tags/notes | **done** — tags on add (`add-member-dialog`) + edit (`edit-member-dialog` + `PATCH .../members/:id`); display `member-card.tsx` |
| Timeline | paginated items; filter All / x.com / custom | **done** |
| Cards | tweet-card / custom card (sanitized markdown) | **done** — custom zhe.to Save: `custom-item-card.tsx`, `lib/zheto-save.ts` |
| Translate | bounded batch ≤20; updates ai_status | **done** — + summary fill when `summaryPrompt` set (`repos/translate.ts`) |
| Push helper | watchlist id + sample curl to **ingest host** | **done** |
| Logs | ingest_logs list (`limit`, newest first) | **done** — `GET /api/watchlists/:id/ingest-logs`, detail `data-testid=ingest-logs` |
| **No** pull refresh / cron | | by design |

### Acceptance

1. Create WL → mint token → push x.com + custom → both on timeline.  
2. Source filter works.  
3. AI fills fields when configured.  
4. Cross-user ids → 404.

## 4. Groups

CRUD + source-aware members + bulk import (x.com handles from Twitter export).  
Add members into a watchlist (copy handles with source_type).

| Capability | API / code | Status |
|------------|------------|--------|
| CRUD + members | `/api/groups`, `groups-page.tsx` | **done** |
| Bulk import | `POST /api/groups/:id/members/import` body `{ text }` — parse `packages/shared/src/twitter-export.ts` (**only scrapeable handles**: `@user`, `x.com/user`, or export rows with `screen_name` / path username; accountId-only skipped offline); batch `INSERT OR IGNORE` | **done** |
| Copy → watchlist | `POST /api/groups/:id/copy-to-watchlist` body `{ watchlistId, memberIds? }` — `copyGroupMembersToWatchlist` | **done** |

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
    "shortUrl": "https://zhe.to/abc",
    "slug": "abc",
    "originalUrl": "https://x.com/i/status/123",
    "isExisting": false
  }
}
```

(`shortUrl` / `slug` may be JSON `null` if upstream omits them.)

- Upstream 201 → newly created (`isExisting=false`)  
- Upstream 200 → already existed (`isExisting=true`) — UI shows saved / already saved  
- Upstream 4xx/5xx → proxy error; 5xx → client 502  

**Card UX**: idle → saving → saved | error (auto-clear error 3s); disable double-submit.

**URL derivation for items**

| source | url | Card Save |
|--------|-----|-----------|
| x.com | `https://x.com/i/status/{tweet.id}` (or author/status if preferred) | **done** — `tweet-card.tsx` |
| custom | `body.url` required to enable Save button | **done** — `custom-item-card.tsx` + `canSaveToZheto` |

### E2E

1. Save settings webhookUrl (mock).  
2. Click Save on timeline card.  
3. Assert mock upstream received exact JSON `{url, note}` shape.  
4. Assert UI reaches `saved`.

Unit/route coverage: `packages/worker/src/routes/ai-zheto-dashboard.test.ts`, `packages/ui/src/lib/zheto-save.test.ts`. Full Playwright card click path remains optional L3 depth (see 07).

## 6. AI Settings (standalone)

`/ai-settings`: provider string + OpenAI-compatible `base_url`, masked key, translate/summary prompts, **test connection**.  
Worker uses encrypted secrets for translate/summary.

| Capability | Location | Status |
|------------|----------|--------|
| GET/PUT config | `/api/ai-config`, `repos/ai-configs.ts`, `ai-settings-page.tsx` | **done** |
| Test connection | `POST /api/ai-config/test` → `testAiConfigRoute` | **done** |
| Summary on translate | `summaryPrompt` → second chat call in `defaultTranslateFn` | **done** |
| Full multi-provider SaaS (gecko-grade adapters) | — | **not MVP** (optional backlog) |

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
