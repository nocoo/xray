# Changelog

## [2.0.0] — 2026-08-11

Major rewrite: Cloudflare Workers + D1 + Vite monorepo. Replaces the vinext/Next stack archived under `legacy/v1/`.

### Added
- Dual-host production layout: browser `xray.hexly.ai` (Access) and ingest `xray-ingest.hexly.ai` (Bearer push)
- Full D1 product schema: users, watchlists, members, tags, groups, items, push tokens, settings, AI configs, integration secrets
- Browser CRUD APIs and UI for watchlists, groups, tokens, settings
- Ingest push (`POST /api/v1/ingest/push`) with canonical item parse and tenant isolation
- Timeline items list with `source_type` filter and load-more
- AI settings with AES-256-GCM KEK envelope; manual bounded translate batch (≤20 / 25s)
- zhe.to integration save (encrypted webhook, host allowlist, mockable upstream)
- Dashboard real D1 aggregates (tenant-scoped)
- L1/G1 pre-commit, L2 coverage + G2 pre-push, GitHub Actions release gate
- Playwright L3 dual-host smoke skeleton (`e2e/*.pw.ts`, `bun run test:l3`)
- v1 → D1 migrate script (`bun run migrate:v1`)

### Changed
- Version source of truth remains root `package.json` (`2.0.0`); `@xray/shared` exports `XRAY_VERSION`
- Coverage domain gate: lines ≥89%, functions ≥90% (worker package)

### Security
- Access JWT path on browser host; ingest Bearer-only; exact Origin checks
- Secrets at rest via `XRAY_SECRETS_KEK` (required for AI / zhe.to in production)
- Ingest rate limit binding `XRAY_INGEST_RL`

### Notes
- Auto AI on ingest / Cron X pull / historical `fetched_posts` migration are intentionally out of scope
- L3 E2E needs local or staging UI+worker processes; CI hard gate remains Vitest L2
