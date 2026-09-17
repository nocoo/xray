# 06 — Testing (6DQ) & TDD

## 1. 6DQ map

| Dimension | X-Ray v2 |
|-----------|----------|
| **L1** | vitest; VM/lib/middleware pure units; contract **≥95%** statements/branches/functions/lines (View shells covered through L3); current Worker branches floor is 94, a gap |
| **L2** | **Real HTTP** via `wrangler dev --local --persist-to .wrangler/state-l2` (port 18787) + route-coverage gate (100% `/api/*`); unit route mocks remain as L1 helpers |
| **L3** | Playwright `e2e/*.pw.ts` — dual-host smoke + watchlists/groups/tokens/settings/AI/zheto/dashboard flows; local isolated data |
| **G1** | biome + tsc strict |
| **G2** | osv-scanner + gitleaks |
| **D1 isolation** | Local-only `xray-db-test`; current fixed L2 state is not per-run isolation. Managed isolated L3 remains planned; never use prod or daily-dev stores |

### Auth in tests (XR-21)

- Single switch: `AUTH_DEV_BYPASS=true` only when `ENVIRONMENT=development|test`.
- Production build refuses bypass.

### Tenant isolation matrix (XR-13) — required L2

For each business resource (watchlist, group, item, token, log, ai config, zheto settings):

| Actor A | Action on B’s id | Expect |
|---------|------------------|--------|
| Access user A | GET/PATCH/DELETE | 404 |
| Push token A | push to B’s watchlist_id | 404 |
| Push token A | GET `/api/v1/ingest/graph` | 200 with **A’s** lists only (never B) |
| Token A revoked | graph or push | 401 |
| Token missing `ingest:read` | GET graph | 403 |
| Token missing `ingest:push` | POST push | 403 |


### L1 coverage denominator (locked)

| Package | Include | Explicit exclude |
|---------|---------|------------------|
| shared | `src/**/*.ts` domain surface | barrel `index.ts`, type-only boundary |
| worker | `lib` + `middleware` + `repos` + `routes` | test helpers, `handle` re-export |
| ui | `viewmodels` + pure `lib` + `api` + `hooks` | View shells, React binders, static fixtures |

**Required thresholds:** statements, branches, functions and lines each **≥95%**. Current package configs enforce all four except Worker branches (94); `scripts/check-coverage.sh 95 95 95` also overrides the Worker branch check to 94. Do not certify the stronger contract until that gap is closed. L2 `gate:routes` + real-HTTP is mandatory for all `/api/*`.

## 2. TDD rules

Red→green→refactor; no adapter without fixtures; VMs without React; table-driven 401/403/404.

## 3. L1 layout

```
packages/shared/**/*.test.ts
packages/worker/src/domain/**/*.test.ts
packages/worker/src/ingest/**/*.test.ts
packages/worker/src/repos/**/*.test.ts
packages/worker/src/middleware/**/*.test.ts
packages/ui/src/viewmodels/**/*.test.ts
```

Vitest D1-shaped stubs are L1 helpers; real HTTP L2 applies local SQLite migrations.

## 4. L2 layout

**Hard gate:** `bun run test:l2` = worker `test:e2e` (wrangler `--local`, persist `.wrangler/state-l2`, env `test` / `xray-db-test`) + `gate:routes`. Pre-push blocks on L2 + G2. L1 coverage ≥95% is pre-commit.

## 4b. L2 file layout

Actual runner: `packages/worker/test/e2e/global-setup.ts`; HTTP cases live alongside it and run through `vitest.e2e.config.ts`. The harness rejects remote credentials, writes/restores a local `.dev.vars`, applies migrations, starts local Wrangler on 18787 and checks `_test_marker`. Fixed `.wrangler/state-l2` and cleanup before marker verification remain gaps against per-run guarded isolation.

## 5. L3 Playwright (S5+)

```
e2e/*.pw.ts   # dual-host-smoke, watchlists, groups, tokens-settings flows
```

Paths grow per module (07 S5). Include zheto **save** with mock upstream (04 §5). Current Playwright starts no server and defaults to daily-dev UI 7007/Worker 37007. Set explicit local `PLAYWRIGHT_BROWSER_URL`, `PLAYWRIGHT_WORKER_URL`, `PLAYWRIGHT_INGEST_URL` only after provisioning verified isolated fixtures; do not run against those defaults. A managed per-run L3 harness remains planned.

## 6. Hooks & CI (XR-14)

| Gate | pre-commit | pre-push (blocks direct main push) | CI after push / PR |
|------|------------|--------------------------------------|---------------------|
| L1 + coverage | yes | | yes (status) |
| G1 biome/tsc | yes | | yes |
| gitleaks | staged, optional if binary absent | required full-history scan | yes |
| L2 | | **yes — primary hard gate** | yes |
| G2 osv | | yes | yes |
| L3 | | no | No current CI job; required isolated workflow/harness remains planned |

Direct main push: pre-push is the hard gate; CI is post-landing verification + release gate (R2-04).

## 7. Ports / persist (locked)

See 02 §3 ports table.

## 8. Definition of done (feature slice)

L1 + L2 + (L3 if user-visible) + biome/tsc + no TweAPI outside legacy dirs.
