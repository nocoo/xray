# X-Ray Docs

Rewrite design package (v2). Legacy vinext/Railway docs live under [`legacy/`](legacy/).

| # | Doc | Purpose |
|---|-----|---------|
| 01 | [Rewrite charter](01-rewrite-charter.md) | Goals, scope keep/drop, locked decisions |
| 02 | [Architecture](02-architecture.md) | Monorepo, CF Workers + D1 + Vite SPA, MVVM, CF Access |
| 03 | [Data model & ingest](03-data-model-and-ingest.md) | Source types, mixed feeds, push API, canonical item |
| 04 | [Features](04-features.md) | Dashboard / WL / Groups / Integrations / AI / Tokens |
| 05 | [Migration](05-migration.md) | watchlists + groups only (no posts) |
| 06 | [Testing 6DQ](06-testing-6dq.md) | Unified L1 + L2/L3 + G2 + D1 |
| 07 | [Implementation plan](07-implementation-plan.md) | **S1–S5** 执行阶段 + 原子 commit 清单 |
| 08 | [Decisions log](08-open-questions.md) | Closed decisions |
| 09 | [Local producer (twitter-cli)](09-local-producer-twitter-cli.md) | Local fetch → cache → canonical → ingest push |
| 10 | [Refresh schedule (60m epoch)](10-refresh-schedule.md) | Pace handles across 60 minutes; 429 defer; incremental |
| 11 | [Channels](11-channels.md) | Channel-bound producer keys, Markdown reports and split reader |
| 12 | [Local environments](12-local-environments.md) | Demo/E2E/Prod contract, work streams and current verification evidence |
| 13 | [Environment fixtures](13-environment-fixtures.md) | Synthetic catalog, provider scenarios, media provenance and feature coverage |

## Locked constraints

1. **Stack**: TypeScript 7, Biome, Vite SPA + Hono Worker (`../bat`), CF Workers + D1.
2. **Auth**: **Cloudflare Access** (Google IdP) on browser host `xray.hexly.ai`; Worker trusts Access JWT (`ALLOWED_EMAILS` optional extra filter).
3. **Ingest host**: `xray-ingest.worker.hexly.ai` — Bearer agent auth for graph, watchlist push and channel article submission. Browser management routes remain unavailable here. The canonical hostname is live in production.
4. **UI/CSS**: full visual retain.
5. **Ingest**: **push-first**, versioned canonical body. No CF Cron auto-refresh.
6. **Sources**: typed (`x.com` | `custom`); mix timeline; source-aware members.
7. **Product**: Dashboard, Watchlists (CRUD), Groups, zhe.to, AI Settings, Channels and per-channel push tokens.
8. **Delete**: Explore, My Account, Usage, Webhooks, TweAPI, auto-refresh.
9. **Migrate**: WL/groups/members/tags only; **no** posts.
10. **Secrets**: versioned AES-256-GCM (KEK); AI keys never plaintext at rest.
11. **MVVM + TDD + 6DQ**; work on **`main`**. Unified L1 owns unit coverage and strict static checks. Pre-commit remains working-tree based; pre-push enforces L2/G2; CI includes a configured managed L3 job. See [06](06-testing-6dq.md) for remaining evidence gaps.
12. **By design (BD-1…BD-10)**: see [08](08-open-questions.md) — e.g. no posts migrate, no auto AI/refresh, insert-ignore dedupe, shared staging AUD, best-effort rate limit, token graph on ingest.

## Historical rewrite phases (see [07](07-implementation-plan.md))

| Phase | Goal | Status (2026-08-11) |
|-------|------|---------------------|
| **S1** | Archive v1 → `legacy/v1/`, scaffold monorepo | **done** |
| **S2** | Login shell + sidebar + mock pages (real CSS) | **done** |
| **S3** | 6DQ automation except E2E (pre-commit / pre-push) | **done** |
| **S4** | D1 schema + migrate WL/groups | **done**（主路径；migrate L2 e2e still thin） |
| **S5** | Modules one-by-one + growing Playwright E2E → 2.0.0 | **done** |
| **Post-S5** | Product gaps (04): groups import/copy, ingest logs, AI test+summary, custom zhe.to, member tags + local producer (09) | **done** |

Progress detail and commit map: [07 §进度](07-implementation-plan.md#进度2026-08-11). Feature matrix status: [04](04-features.md).

## Current local environment workflow

Use `bun run dev` at `https://xray.dev.hexly.ai` or `bun run preview` for locally served built assets. The launcher owns signed authentication, native local D1, dynamic Worker ports and known-provider fixtures. Demo preserves edits; each E2E instance is fresh and locked; local Prod requires explicit real Access sign-in. Hosted pages ignore interactive preferences.

`bun run test:l2` owns the native HTTP stack and route inventory. `bun run test:l3` builds and owns a separate Playwright stack; manual endpoint provisioning is no longer required. On 2026-09-27, the full native L2 suite passed 41 tests across six files with cleanup, including concurrency and ownership regressions. The final managed L3 suite passed 25/25 in 2.4 minutes with cleanup. Google Chrome acceptance through the local Caddy address passed persistence, draft guards, switching and the manual E2E lifecycle; six captured product surfaces were reviewed. CI execution, real Prod verification and a complete visual audit remain unverified. Current evidence belongs in [12](12-local-environments.md); the historical phase table above is not evidence for this runtime.
