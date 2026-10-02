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

- Browser `xray.hexly.ai` requires Cloudflare Access; agent `xray-ingest.worker.hexly.ai` allows only live, ingest graph, ingest push and channel article submission. Agents use the ingest host; token administration stays browser-only and Bearer tokens cannot mint/revoke tokens. The canonical ingest hostname is live in production; producer configuration must use it.
- Channels use one channel per key, the `articles:write` scope, Markdown reports with producer retry deduplication on `(channel_id, external_id)`. Only the authenticated browser owner can edit or delete reports; edits preserve source and external ID. Deleted reports can be submitted again. Never trust request fields for the tenant, channel or authenticated source. Channel images are external HTTPS URLs only; no upload, proxy or storage. Contract and implementation status: [Channels](docs/11-channels.md).
- Derive tenant `user_id` from verified auth, never a client authorization field. Scope parent and child queries to that user; reject cross-user access. Preserve stable Access issuer/sub identity binding and fail closed on conflicts.
- Demo/E2E keep normal authentication: the managed runtime signs fixture identities and the Worker verifies JWT signature, issuer, audience, expiry and tenant binding. Local JWKS, presentation time and external fixture bindings are valid only with `ENVIRONMENT=development|test`; production rejects them. Keep browser mutation origin checks; do not restore an auth bypass.
- Ingest validates limits, normalizes/deduplicates and records status; it never triggers AI. Preserve manual AI execution, deadlines, bounded batches and tenant-scoped state transitions in the architecture contract.
- Keep plaintext push tokens one-time-only and stored hashes; encrypt AI keys/webhooks using versioned AES-256-GCM with tenant/field AAD. Never log keys, tokens or full payloads.
- Channel management lives at `/channels`, immediately above Settings in the sidebar. Per-channel `/channels/:channelId/settings` owns named push tokens; global Settings owns account and AI; `/tags` is a dedicated management page in the Settings sidebar group. Article tags are the live, deduplicated union of their channel and source token tags, including revoked tokens, shown only below the article title. Server-side date-range, keyword and multi-tag filters apply before pagination; URLs and history retain the combined filters. Channel and key tag associations are tenant-validated and replaced atomically; deleting a tag removes associations without deleting resources. Render tags with Basalt `TagBadge`, hashing the trimmed name into its six-color palette consistently across the app. Persist sidebar order; deleting a channel also deletes its reports and invalidates its keys. Every content page uses Basalt `PageHeader` with a title and description, except mobile Channel reading/list routes: one compact sticky Basalt `AppHeader` replaces duplicate chrome; desktop retains `PageHeader`. Use Basalt dialogs for resource creation/editing and confirmation; inline tag assignment uses its Popover. Primary reading content uses the brightest Basalt surface (`LayerCard.Well` / `--basalt-bright`), with secondary panels and page chrome progressively dimmer in both themes.
- Mobile Channel routes use Basalt responsive document scrolling and an edge-to-edge island; desktop retains bounded panes. The shell owns safe areas with `viewport-fit=cover`; do not duplicate safe padding, hardcode browser toolbar heights or introduce JS viewport sizing. Reading settings and secondary actions use disclosure with 44px touch targets. Keep root/pane reading positions and focus through history, filters, modal dismissal and breakpoint changes. See [immersive reading](docs/14-immersive-mobile-reading.md).
- Article reading state is account-persisted in D1; existing and new reports default unread. Opening content marks it read through a browser-only, origin-protected mutation. Channel-wide mark-all-read ignores filters/pagination; future arrivals remain unread. Article and sidebar unread indicators use glowing dots without counts; refresh and mark-all-read live above the channel article list.
- Related-link previews are browser-only and verify tenant ownership plus URL membership in stored Markdown. Fetch public HTTPS HTML with bounded size, timeout and redirects; use tenant-scoped ephemeral metadata caching and external images only. Keep the reader's brightest surface and show links by default in a secondary right column, or below the article on narrow screens. Manual close/reopen animates the layout and respects reduced motion; full-width reading does not hide links. See [Channels](docs/11-channels.md).
- Shared code is pure; UI ViewModels have no View/DOM imports; Worker code owns data/auth and has no React. The retired NextAuth/vinext/SQLite instructions in the retrospective do not describe this runtime.
- Producer orchestration uses the existing refresh script and [refresh skill](skills/xray-refresh-watchlists/SKILL.md); do not reimplement fetch/push. Preserve secret file permissions and producer checkpoints.

## Stack / Layout

| Component | Location / choice |
|---|---|
| Shared contracts | `packages/shared/`; pure TypeScript DTOs/mappers |
| UI | `packages/ui/`; React, Vite, MVVM, browser API client |
| API / storage | `packages/worker/`; Hono, Access/Bearer middleware, repositories, D1 migrations |
| Producer / quality | `scripts/`, `skills/`, package Vitest runners and `e2e/*.pw.ts` |

## Local Preview

- Start the managed stack with `bun run dev`; `bun run preview` builds and serves the same application from `packages/worker/static`.
- Open **https://xray.dev.hexly.ai** in Google Chrome for local preview and acceptance; use this Caddy HTTPS address rather than raw ports. Caddy proxies to the local gateway on 7007; it serves Vite/HMR or built assets and allocates the Worker port dynamically.
- Local chrome has **Demo | E2E | Prod**, with no visible label. Startup priority: automated E2E lock, explicit `--mode`, accepted enum preference in `localStorage["xray:environment-mode"]`, Demo. Only script-launched automated E2E disables other choices until shutdown. Manual E2E, including `--mode e2e` and remembered selections, can switch back to Demo/Prod; switching away cleans up its disposable state.
- Only launcher HTML injects the bootstrap marker. Initialization fixes all API and existing Twitter media proxy requests to `/__local/instances/<instanceId>/api/...`; the descriptor supplies the ingest URL. Accepted switches check drafts and reload `/`; stale instances cannot retarget requests. Hosted pages ignore preferences. Automated CI initializes its instance but hides the control and never reads/writes interactive preferences.
- Demo persists in `packages/worker/.wrangler/environments/demo`; E2E creates owned disposable state per run. Preserve the retired `.wrangler/state-mock` store without importing or deleting it. See [local environments](docs/12-local-environments.md) and [fixture matrix](docs/13-environment-fixtures.md).
- Local Prod uses the real Access identity through the gateway. `bun run login:prod` signs in; keep credentials server-side. Prod operations can change live data and are never an automated test target.
- Maintain project instructions only in `AGENTS.md`; do not recreate a legacy handbook or alias.

## Commands

Run from root with Bun 1.3.14, Node for tool scripts, and installed gitleaks/osv-scanner. Install uses the frozen root workspace lockfile.

```bash
bun install --frozen-lockfile
bun run dev
bun run dev -- --mode demo
bun run dev -- --mode e2e
bun run preview -- --mode demo
bun run env:db -- init --mode demo
bun run env:db -- migrate --mode demo
bun run build:shared
bun run typecheck
bun run lint
bun run build
bun run test:coverage
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l2
bun run gate:routes
bun run capture:demo
bun x --no-install playwright install chromium webkit
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l3
gitleaks detect --no-banner --source .
osv-scanner scan --lockfile=bun.lock
```

`test:l2` already includes `gate:routes`; run the latter alone when reviewing the endpoint inventory. Mocked route tests remain L1 helpers.
`bun run test:l3` builds and runs `scripts/test-l3.ts`, which owns the fresh E2E gateway/Worker, fixture JWTs, Playwright endpoints and cleanup. Direct unmanaged Playwright invocation is rejected; do not manually point it at daily dev. Both test launchers reject inherited production credentials. Stop Demo before database commands: `env:db seed --mode demo` requires an unseeded store; `env:db reset --mode demo` explicitly replaces the owned Demo catalog and deletes its edits.

## Verification

6DQ = unified L1 (absorbing former G1) + L2/L3 + G2 + D1 isolation. Status: `enforced`, `planned`, `manual`, `N/A`; no skipped/focused tests.

| Piece | Required proof and current reality | Status | Evidence / gap |
|---|---|---|---|
| L1 — complete unified contract | All four coverage metrics ≥95% plus strict static lanes on an installed index-snapshot hook with proven rejection, under 30s | planned | Snapshot scope, rejection proof and timing are unverified; the subcheck rows below describe what is configured today |
| L1 subcheck — shared/UI coverage | Statements/branches/functions/lines each ≥95% over the declared non-View scope | enforced | Package Vitest configs, `test:coverage`, pre-commit and CI |
| L1 subcheck — Worker coverage | All four metrics ≥95% over the declared production scope | enforced | Worker config and `check-coverage.sh`; no per-package branch exception |
| L2 | Real HTTP plus full endpoint/method inventory and cross-tenant/SQL assertions | enforced | Worker `test/e2e/`, `check-route-coverage.ts`; pre-push and CI |
| L3 | Critical browser/agent journeys against an isolated local stack | enforced | Managed harness and CI Chromium/WebKit job configured; installed Basalt 2.2.0 local run passed 36/36 tests in 4.8 minutes on 2026-10-02 with cleanup. Scoped Chrome/Caddy light/dark mobile/desktop acceptance passed; corrected revision `8c20d4e` passed CI `37015863843` and deployment `37016438221`; physical iPhone remains unverified |
| L1 subcheck — static lanes (former G1) | Strict types and lint/format, zero errors/warnings | enforced | Turbo typecheck, Biome, pre-commit and CI; these static lanes run on the working tree, so unified L1 is not snapshot-based |
| G2 | Dependency + secret scanners, required tools fail closed | enforced | Pre-push gitleaks + OSV and CI; pre-commit gitleaks is optional, push-ref scoping remains a gap |
| D1 | Per-run local state with guards/marker before writes and cleanup | enforced | Managed runtime owns generated config/secrets, unique E2E state and guarded cleanup. Full native L2 passed 41/41 on 2026-10-02 with 62/62 routes, including six concurrency/ownership/cleanup tests |
| Build | Build shared/UI/Worker output | manual | `bun run build`; exact-revision CI `37015863843` and deployment `37016438221` both built corrected revision `8c20d4e` |
| Docs | Keep route/tenant matrices and architecture current | manual | Numbered docs and full diff review |

Pre-commit runs working-tree lint, types and coverage, then optional staged gitleaks. Target: all of unified L1 on an index snapshot, <30s.
Pre-push runs L2 then required gitleaks/OSV sequentially and scans repository history, not stdin push refs. Target: L2/G2 parallel, exact pushed refs, <3min.
Hooks are check-only. No `--no-verify`, disabled gates, autofix gates or reduced thresholds. The owner merged former G1 into L1 on 2026-09-21; the framework keeps the 6DQ name.

## Resources / Isolation

Interactive entry: gateway 7007 behind `xray.dev.hexly.ai`; Worker and inspector ports are allocated dynamically. L2 owns a fresh Worker; L3 owns a fresh gateway and Worker. Each automated run uses `packages/worker/.wrangler/environments/e2e-*`, with SQLite under `d1/`; Demo uses the separate persistent `demo/` directory.
Use `scripts/envs.ts` and `packages/worker/dev/local-runtime.ts`. They validate local bindings, canonical owned paths and `owner.json`; seeded stores require matching `_test_marker` before fixture writes/cleanup. Runtime config and `.dev.vars` are generated inside the owned run directory, never in the daily Worker directory. No remote test deployments, inherited Prod credentials or automated resets of Demo. Keep one active owner per store; concurrency/failure evidence must be recorded rather than inferred from guards.

## Operations / Release

Authorized producer runs load `~/.config/xray/push.env` (mode 600) and call `bun run refresh:watchlists --`; `.xray-push.env` is only an ignored pointer, never a plaintext token store.
Token rotation and producer setup: [runbook](docs/09-local-producer-twitter-cli.md). Do not read or print secret values as part of documentation/tests.
Authorized releases use `bun run release` (patch default, `-- minor`/`-- major` when requested); it bumps/syncs/changelogs/commits/pushes/tags/releases. Deployment/migration and both-host live checks: [delivery plan](docs/07-implementation-plan.md).

## Retrospective

Narratives: [Retrospective.md](Retrospective.md); brief recurring rules here, cross-project lessons in global rules/nmem and deterministic checks in hooks/tests.
- Keep browser and ingest host capabilities distinct in every new route and test.
