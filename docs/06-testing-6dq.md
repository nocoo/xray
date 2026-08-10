# 06 — Testing (6DQ) & TDD

## 1. 6DQ map

| Dimension | X-Ray v2 |
|-----------|----------|
| **L1** | vitest; domain/VM/repos+mock-d1; coverage gate ≥90% lines domain |
| **L2** | Vitest HTTP/route/repo matrix with D1-shaped mocks (primary hard gate); wrangler `--local` isolated D1 smoke optional release gate |
| **L3** | Playwright — **from S5**; CI required on main after introduced |
| **G1** | biome + tsc strict |
| **G2** | osv-scanner + gitleaks |
| **D1 isolation** | DB `xray-db-test`; persist `.wrangler/state-l2` / `state-l3`; never prod |

### Auth in tests (XR-21)

- Single switch: `AUTH_DEV_BYPASS=true` only when `ENVIRONMENT=development|test`.
- Production build refuses bypass.

### Tenant isolation matrix (XR-13) — required L2

For each business resource (watchlist, group, item, token, log, ai config, zheto settings):

| Actor A | Action on B’s id | Expect |
|---------|------------------|--------|
| Access user A | GET/PATCH/DELETE | 404 |
| Push token A | push to B’s watchlist_id | 404 |
| Token A revoked | push | 401 |

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

Vitest D1-shaped stubs (no auto migration apply)ss (bat pattern).

## 4. L2 layout

**Current hard gate (BD-1 / XR-14):** `bun run test` + `bun run test:coverage` over worker unit/route matrix (mock D1). Full `wrangler --local` process matrix remains a release-gate deepening item, not a pre-push blocker.

## 4b. L2 file layout

```
packages/worker/src/test (Vitest; hand-written SQL-shaped stubs — not auto-applied migrations)/
  global-setup.ts   # wrangler dev --local --persist-to .wrangler/state-l2 --port 18787
  live.http.test.ts
  me.http.test.ts
  watchlists.http.test.ts
  ingest.http.test.ts
  host-routing.http.test.ts    # R3-04 matrix (see 02)
  tenant-isolation.http.test.ts
  push-tokens.http.test.ts
  migrate.http.test.ts         # R3-11 idempotent / conflict / kek
```

## 5. L3 Playwright (S5+)

```
packages/ui/e2e/*.pw.ts
```

Paths grow per module (07 S5). Include zheto **save** with mock upstream (04 §5).

## 6. Hooks & CI (XR-14)

| Gate | pre-commit | pre-push (blocks direct main push) | CI after push / PR |
|------|------------|--------------------------------------|---------------------|
| L1 + coverage | yes | | yes (status) |
| G1 biome/tsc | yes | | yes |
| gitleaks | staged | full | yes |
| L2 | | **yes — primary hard gate** | yes |
| G2 osv | | yes | yes |
| L3 | | no | yes after S5; **blocks release** |

Direct main push: pre-push is the hard gate; CI is post-landing verification + release gate (R2-04).

## 7. Ports / persist (locked)

See 02 §3 ports table.

## 8. Definition of done (feature slice)

L1 + L2 + (L3 if user-visible) + biome/tsc + no TweAPI outside legacy dirs.
