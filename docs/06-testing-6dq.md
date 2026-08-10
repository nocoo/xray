# 06 — Testing (6DQ) & TDD

## 1. 6DQ map

| Dimension | X-Ray v2 |
|-----------|----------|
| **L1** | vitest; domain/VM/repos+mock-d1; coverage gate ≥90% lines domain |
| **L2** | wrangler `--local` + isolated D1; HTTP routes |
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

mock-d1 applies real SQL migrations (bat pattern).

## 4. L2 layout

```
packages/worker/test/l2/
  global-setup.ts   # wrangler dev --local --persist-to .wrangler/state-l2 --port 18787
  live.http.test.ts
  me.http.test.ts
  watchlists.http.test.ts
  ingest.http.test.ts
  tenant-isolation.http.test.ts
  push-tokens.http.test.ts
```

## 5. L3 Playwright (S5+)

```
packages/ui/e2e/*.pw.ts
```

Paths grow per module (07 S5). Include zheto **save** with mock upstream (04 §5).

## 6. Hooks & CI (XR-14)

| Gate | pre-commit | pre-push | CI main |
|------|------------|----------|---------|
| L1 + coverage | yes | | yes |
| G1 biome/tsc | yes | | yes |
| gitleaks | staged | full | yes |
| L2 | | yes | yes |
| G2 osv | | yes | yes |
| L3 | | no (too slow default) | **yes** after S5 |

CI is **mandatory** required checks — not optional.

## 7. Ports / persist (locked)

See 02 §3 ports table.

## 8. Definition of done (feature slice)

L1 + L2 + (L3 if user-visible) + biome/tsc + no TweAPI outside legacy dirs.
