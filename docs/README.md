# X-Ray Docs

Rewrite design package (v2). Legacy vinext/Railway docs live under [`legacy/`](legacy/).

| # | Doc | Purpose |
|---|-----|---------|
| 01 | [Rewrite charter](01-rewrite-charter.md) | Goals, scope keep/drop, locked decisions |
| 02 | [Architecture](02-architecture.md) | Monorepo, CF Workers + D1 + Vite SPA, MVVM, CF Access |
| 03 | [Data model & ingest](03-data-model-and-ingest.md) | Source types, mixed feeds, push API, canonical item |
| 04 | [Features](04-features.md) | Dashboard / WL / Groups / Integrations / AI / Tokens |
| 05 | [Migration](05-migration.md) | watchlists + groups only (no posts) |
| 06 | [Testing 6DQ](06-testing-6dq.md) | L1/L2/L3 + G1/G2 + D1 |
| 07 | [Implementation plan](07-implementation-plan.md) | **S1–S5** 执行阶段 + 原子 commit 清单 |
| 08 | [Decisions log](08-open-questions.md) | Closed decisions |

## Locked constraints

1. **Stack**: TypeScript 7, Biome, Vite SPA + Hono Worker (`../bat`), CF Workers + D1.
2. **Auth**: **Cloudflare Access** (Google IdP) on browser host `xray.hexly.ai`; Worker `ALLOWED_EMAILS` mandatory.
3. **Ingest host**: `xray-ingest.hexly.ai` — Access bypass; **only** `POST /api/v1/ingest/push` + Bearer (XR-01).
4. **UI/CSS**: full visual retain.
5. **Ingest**: **push-first**, versioned canonical body. No CF Cron auto-refresh.
6. **Sources**: typed (`x.com` | `custom`); mix timeline; source-aware members.
7. **Product**: Dashboard, Watchlists (CRUD), Groups, zhe.to, AI Settings, Push tokens.
8. **Delete**: Explore, My Account, Usage, Webhooks, TweAPI, auto-refresh.
9. **Migrate**: WL/groups/members/tags only; **no** posts.
10. **Secrets**: versioned AES-256-GCM (KEK); AI keys never plaintext at rest.
11. **MVVM + TDD + 6DQ**; work on **`main`** (hard gate = **pre-push**; CI = post-push + release).
12. **By design (BD-1…BD-9)**: see [08](08-open-questions.md) — e.g. no posts migrate, no auto AI/refresh, insert-ignore dedupe, shared staging AUD, best-effort rate limit.

## Execution phases (see [07](07-implementation-plan.md))

| Phase | Goal | Status (2026-08-10) |
|-------|------|---------------------|
| **S1** | Archive v1 → `legacy/v1/`, scaffold monorepo | **done** |
| **S2** | Login shell + sidebar + mock pages (real CSS) | **done** |
| **S3** | 6DQ automation except E2E (pre-commit / pre-push) | **done** |
| **S4** | D1 schema + migrate WL/groups | todo |
| **S5** | Modules one-by-one + growing Playwright E2E → 2.0.0 | todo |

Progress detail and commit map: [07 §进度](07-implementation-plan.md#进度2026-08-10).
