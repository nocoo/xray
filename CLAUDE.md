# X-Ray

Tenant-scoped watchlists and content ingestion with a browser dashboard and authenticated agent producers.
Profile: `ts-worker-web` (Bun/Turbo monorepo, React/Vite UI, Hono Worker/D1).
Direction: [rewrite charter](docs/01-rewrite-charter.md), [architecture](docs/02-architecture.md). Frameworks must preserve this handbook.

## Sources of Truth

This file is the contract; hooks, CI and config are enforcement. Raise weaker gates rather than lower the contract.

| Fact | Where |
|---|---|
| Human docs | [README.md](README.md), [docs index](docs/README.md) |
| Version / dependencies | Root `package.json`, `bun.lock`; bare SemVer, display `v` prefix |
| Quality | [6DQ](docs/06-testing-6dq.md), `.husky/`, `.github/workflows/ci.yml`, package Vitest configs |
| Secret management | [local producer](docs/09-local-producer-twitter-cli.md); values stay outside Git |
| Machine rules / accidents | Global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md) |

## Project Invariants

- Browser `xray.hexly.ai` requires Cloudflare Access; agent `xray-ingest.hexly.ai` allows only live, ingest graph and ingest push. Agents use the ingest host; token administration stays browser-only and Bearer tokens cannot mint/revoke tokens.
- Derive tenant `user_id` from verified auth, never a client authorization field. Scope parent and child queries to that user; reject cross-user access. Preserve stable Access issuer/sub identity binding and fail closed on conflicts.
- `AUTH_DEV_BYPASS` is the only local auth switch, valid only with `ENVIRONMENT=development|test`; production must reject it. Keep browser mutation origin checks.
- Ingest validates limits, normalizes/deduplicates and records status; it never triggers AI. Preserve manual AI execution, deadlines, bounded batches and tenant-scoped state transitions in the architecture contract.
- Keep plaintext push tokens one-time-only and stored hashes; encrypt AI keys/webhooks using versioned AES-256-GCM with tenant/field AAD. Never log keys, tokens or full payloads.
- Shared code is pure; UI ViewModels have no View/DOM imports; Worker code owns data/auth and has no React. The retired NextAuth/vinext/SQLite instructions in the retrospective do not describe this runtime.
- Producer orchestration uses the existing refresh script and [refresh skill](skills/xray-refresh-watchlists/SKILL.md); do not reimplement fetch/push. Preserve secret file permissions and producer checkpoints.

## Stack / Layout

| Component | Location / choice |
|---|---|
| Shared contracts | `packages/shared/`; pure TypeScript DTOs/mappers |
| UI | `packages/ui/`; React, Vite, MVVM, browser API client |
| API / storage | `packages/worker/`; Hono, Access/Bearer middleware, repositories, D1 migrations |
| Producer / quality | `scripts/`, `skills/`, package Vitest runners and `e2e/*.pw.ts` |

## Commands

Run from root with Bun 1.3.14, Node for tool scripts, and installed gitleaks/osv-scanner. Install uses the frozen root workspace lockfile.

```bash
bun install --frozen-lockfile
bun run dev
bun run build:shared
bun run typecheck
bun run lint
bun run build
bun run test:coverage
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l2
bun run gate:routes
gitleaks detect --no-banner --source .
osv-scanner scan --lockfile=bun.lock
```

`test:l2` already includes `gate:routes`; run the latter alone when reviewing the endpoint inventory. Mocked route tests remain L1 helpers.
`bun run test:l3` invokes Playwright without starting servers. It requires explicit `PLAYWRIGHT_BROWSER_URL`, `PLAYWRIGHT_WORKER_URL` and `PLAYWRIGHT_INGEST_URL` on a separately verified local test stack; do not use its daily-dev defaults.

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1 isolation. Status: `enforced`, `planned`, `manual`, `N/A`; no skipped/focused tests.

| Piece | Required proof and current reality | Status | Evidence / gap |
|---|---|---|---|
| L1 shared/UI | Statements/branches/functions/lines each ≥95% over the declared non-View scope | enforced | Package Vitest configs, `test:coverage`, pre-commit and CI |
| L1 Worker | All four metrics ≥95% over the declared production scope | enforced | Worker config and `check-coverage.sh`; no per-package branch exception |
| L2 | Real HTTP plus full endpoint/method inventory and cross-tenant/SQL assertions | enforced | Worker `test/e2e/`, `check-route-coverage.ts`; pre-push and CI |
| L3 | Critical browser/agent journeys against an isolated local stack | planned | Specs exist, but `playwright.config.ts` has no server harness and CI has no L3 job |
| G1 | Strict types and lint/format, zero errors/warnings | enforced | Turbo typecheck, Biome, pre-commit and CI |
| G2 | Dependency + secret scanners, required tools fail closed | enforced | Pre-push gitleaks + OSV and CI; pre-commit gitleaks is optional, push-ref scoping remains a gap |
| D1 | Per-run local state with guards/marker before writes and cleanup | planned | L2 is local and checks credentials/marker, but reuses fixed state and rewrites a shared `.dev.vars`; L3 defaults use dev |
| Build | Build shared/UI/Worker output | manual | `bun run build`; current quality/L2 CI does not enforce the complete production bundle |
| Docs | Keep route/tenant matrices and architecture current | manual | Numbered docs and full diff review |

Pre-commit runs working-tree lint, types and coverage, then optional staged gitleaks. Target: all L1/G1 on an index snapshot, <30s.
Pre-push runs L2 then required gitleaks/OSV sequentially and scans repository history, not stdin push refs. Target: L2/G2 parallel, exact pushed refs, <3min.
Hooks are check-only. No `--no-verify`, disabled gates, autofix gates or reduced thresholds.

## Resources / Isolation

Daily dev: UI 7007 behind `xray.dev.hexly.ai`, Worker 37007, `.wrangler/state`. L2: Worker 18787, fixed `.wrangler/state-l2` in the Worker tree.
The architecture reserves L3 Worker 28787/state-l3, but current Playwright defaults still target UI 7007/Worker 37007; isolated L3 setup is required before use.
Use local Wrangler/Miniflare and a fresh per-run SQLite directory, validate local/test context and `_test_marker` before fixtures/cleanup. No remote `-test` deployments or production/daily-dev stores in E2E.
Existing L2 names such as `xray-db-test` are local bindings; serialize current fixed-path runs until per-run isolation is implemented.

## Operations / Release

Authorized producer runs load `~/.config/xray/push.env` (mode 600) and call `bun run refresh:watchlists --`; `.xray-push.env` is only an ignored pointer, never a plaintext token store.
Token rotation and producer setup: [runbook](docs/09-local-producer-twitter-cli.md). Do not read or print secret values as part of documentation/tests.
Authorized releases use `bun run release` (patch default, `-- minor`/`-- major` when requested); it bumps/syncs/changelogs/commits/pushes/tags/releases. Deployment/migration and both-host live checks: [delivery plan](docs/07-implementation-plan.md).

## Retrospective

Narratives: [Retrospective.md](Retrospective.md); brief recurring rules here, cross-project lessons in global rules/nmem and deterministic checks in hooks/tests.
- Keep browser and ingest host capabilities distinct in every new route and test.
