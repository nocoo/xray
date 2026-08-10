# 07 — Implementation Plan

**Branch policy (D8): work directly on `main`.**  
Accept temporary production break until Workers cutover.

Coding may start after this doc set; decisions in 08 are **closed**.

## Phase 0 — Scaffold on main

| Step | Commit | Deliverable |
|------|--------|-------------|
| 0.1 | `chore: scaffold bun workspaces monorepo` | root biome/ts7/turbo; move or delete vinext app tree as needed |
| 0.2 | `feat(shared): source types and canonical item` | `@xray/shared` + L1 tests |
| 0.3 | `feat(worker): hono live + d1 migrations skeleton` | wrangler, `/api/live` |
| 0.4 | `feat(ui): vite shell with legacy css` | SPA chrome, nav without Explore/My Account |
| 0.5 | `test(worker): mock-d1 helper` | bat-style |
| 0.6 | `docs: readme v2 entry` | already partially done |

**Exit**: local worker+ui boot; no TweAPI required.

> Aggressive delete of `src/` vinext tree is OK on main once 0.1 lands; keep `database/*.db` for migration script input.

## Phase 1 — CF Access auth

| Step | Commit | Deliverable |
|------|--------|-------------|
| 1.1 | `feat(worker): access-auth middleware` | jose + JWKS; fail-closed |
| 1.2 | `feat(worker): users upsert from access email` | |
| 1.3 | `feat(ui): access session gate` | no NextAuth login |
| 1.4 | `test: access-auth unit + l2 bypass mode` | |

**Exit**: protected `/api/*` with Access (prod) / bypass (test).

## Phase 2 — Push tokens + ingest (core)

| Step | Commit | Deliverable |
|------|--------|-------------|
| 2.1 | `feat: push_tokens schema and mint api` | Access-only mint |
| 2.2 | `feat(ui): push tokens settings page` | |
| 2.3 | `feat: items schema and repos` | source_type + external_id |
| 2.4 | `feat: POST /api/ingest/push` | x.com + custom validation |
| 2.5 | `feat: watchlists crud api + ui` | members |
| 2.6 | `feat: mixed timeline ui` | filters + cards |
| 2.7 | `test: l1 normalizers + l2 push http` | |
| 2.8 | `test: l3 push-to-timeline path` | Playwright + token |

**Exit**: token → push mix → timeline. **No cron. No pull refresh.**

## Phase 3 — AI Settings + translate/summary

| Step | Commit | Deliverable |
|------|--------|-------------|
| 3.1 | `feat: ai settings storage + api` | gecko/`@nocoo/next-ai` patterns |
| 3.2 | `feat(ui): ai-settings page` | standalone nav |
| 3.3 | `feat: translate and summary pipeline` | worker AI SDK |
| 3.4 | `test: ai config + translate unit` | mock model |

## Phase 4 — Groups + Dashboard + zhe.to

| Step | Commit | Deliverable |
|------|--------|-------------|
| 4.1 | `feat: groups full port` | |
| 4.2 | `feat: dashboard summary` | |
| 4.3 | `feat: zheto integration full keep` | |
| 4.4 | `test: l2 groups + zheto smoke` | |

## Phase 5 — Migration + strip v1

| Step | Commit | Deliverable |
|------|--------|-------------|
| 5.1 | `feat: migrate-v1-to-d1 script` | WL/groups only |
| 5.2 | `chore: import local sqlite snapshot` | validate |
| 5.3 | `chore: remove vinext tweapi usage webhooks` | rg clean |
| 5.4 | `ci: 6dq workflows` | |

## Phase 6 — Prod cutover

| Step | Commit | Deliverable |
|------|--------|-------------|
| 6.1 | `chore: prod d1 access secrets routes` | |
| 6.2 | `chore: migrate prod metadata` | no posts |
| 6.3 | `release: 2.0.0` | |
| 6.4 | `chore: decommission railway` | |

## File map (key)

```
packages/shared/src/source.ts
packages/shared/src/item.ts
packages/shared/src/tweet/x-tweet.ts
packages/worker/src/middleware/access-auth.ts
packages/worker/src/middleware/push-token-auth.ts
packages/worker/src/routes/ingest.ts
packages/worker/src/routes/push-tokens.ts
packages/worker/src/routes/watchlists.ts
packages/worker/src/ai/*
packages/ui/src/views/ai-settings/*
packages/ui/src/views/settings/tokens/*
packages/ui/src/views/integrations/zheto/*
packages/ui/src/viewmodels/*
scripts/migrate-v1-to-d1.ts
```

## Deletion checklist (end Phase 5)

```bash
rg -i 'tweapi|TweAPI' --glob '!docs/legacy/**'          # 0
rg -n 'vinext|next-auth|bun:sqlite' packages            # 0
rg -n 'webhooks|/usage|/bookmarks|/analytics' packages/ui  # 0
rg -n 'fetch_interval|cron' packages/worker/src         # 0 (no auto refresh)
```

## Risk note (main-branch rewrite)

- Land Phase 0–1 quickly so `main` has *some* runnable worker.
- Do not leave half-deleted vinext without README warning.
- Prod DNS stays on old stack until Phase 6 — or site is down if already only Railway; coordinate cutover.
