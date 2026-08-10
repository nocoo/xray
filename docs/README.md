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
2. **Auth**: **Cloudflare Access** (Google IdP) — same class as bat/surety; no app-level NextAuth.
3. **UI/CSS**: full visual retain.
4. **Ingest**: **push-first**. External agents (twitter-cli-like, hermes, …) POST items. No CF Cron auto-refresh.
5. **Sources**: typed (`x.com` | `custom` | …); one watchlist = **mixed** stream.
6. **Product**: Dashboard, Watchlists, Groups, Integrations (**zhe.to** full), Settings, **AI Settings** (separate), **Push tokens** management.
7. **Delete**: Explore, My Account, Usage, Webhooks, TweAPI, auto-refresh/cron fetch.
8. **Migrate**: watchlists + groups (+ members/tags). **No** historical posts.
9. **AI**: reuse gecko-class AI settings / `@nocoo/next-ai` patterns (worker-safe server helpers).
10. **MVVM + TDD + 6DQ**; work **directly on `main`**.

## Execution phases (see [07](07-implementation-plan.md))

| Phase | Goal |
|-------|------|
| **S1** | Archive v1 → `legacy/v1/`, scaffold monorepo |
| **S2** | Login shell + sidebar + mock pages (real CSS) |
| **S3** | 6DQ automation except E2E (pre-commit / pre-push) |
| **S4** | D1 schema + migrate WL/groups |
| **S5** | Modules one-by-one + growing Playwright E2E → 2.0.0 |
