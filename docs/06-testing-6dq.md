# 06 — Testing (6DQ) & TDD

## 1. 6DQ map for X-Ray v2

| Dimension | Meaning | X-Ray v2 implementation |
|-----------|---------|-------------------------|
| **L1** Unit/Component | pure domain, VM, mappers, repos with mock D1 | vitest, coverage ≥ 90% (UI thin shells exempt) |
| **L2** Integration/API | real Hono routes + **local D1** (wrangler) | vitest HTTP against `wrangler dev --local` |
| **L3** System/E2E | browser flows | Playwright against local stack |
| **G1** Static | typecheck + biome | `tsc --noEmit`, `biome check --error-on-warnings` |
| **G2** Security | deps + secrets | osv-scanner + gitleaks (pre-push / CI) |
| **D1** Isolation | never touch prod D1 in tests | separate DB name `xray-db-test`, persist dir `.wrangler/state-test` |

### Auth & push in tests

- **Access**: L1 unit-tests middleware with fixture JWTs; L2/L3 use `E2E_SKIP_AUTH` or test bypass **only** when explicitly set (prod fail-closed).
- **Push tokens**: L2 mints via bypass session → push items → assert timeline; revoke → 401.
- **No cron tests** — auto-refresh is out of scope.

## 2. TDD rules

1. **Red → green → refactor** for domain and ingest mappers first.
2. No production adapter without golden fixture tests.
3. ViewModels tested without React; Views smoke-tested lightly.
4. API routes: table-driven tests for 401/403/404/200.
5. Do not mock away WindowGate/dedupe — those are the product.

## 3. L1 layout

```
packages/shared/src/**/*.test.ts
packages/worker/src/domain/**/*.test.ts
packages/worker/src/ingest/**/*.test.ts
packages/worker/src/repos/**/*.test.ts      # mock-d1 (better-sqlite3)
packages/ui/src/viewmodels/**/*.test.ts
packages/ui/src/models/**/*.test.ts
```

### mock-d1 (from bat)

`packages/worker/src/test-helpers/mock-d1.ts`:

- better-sqlite3 memory/file
- apply same SQL migrations as wrangler
- expose D1-compatible `prepare/bind/first/all/run/batch`

Repos unit tests inject mock D1; no network.

### Coverage gate

- Root script `test:unit:coverage` fails if lines/branches below threshold (shared+worker domain ≥ 90%).
- pre-commit: L1 + G1 (fast subset OK if full coverage on CI).

## 4. L2 layout (local D1 via wrangler)

Pattern reference: `bat/packages/worker/vitest.e2e.config.ts` + `surety` L2-HTTP.

```
packages/worker/test/l2/
  global-setup.ts     # boot wrangler dev --local --persist-to .wrangler/state-l2
  watchlists.http.test.ts
  groups.http.test.ts
  ingest.http.test.ts
  auth.http.test.ts
```

- `E2E_SKIP_AUTH=true` **or** test session mint helper for HTTP tests.
- Migrations applied with `wrangler d1 migrations apply xray-db --local --persist-to ...`
- **Forbidden**: `--remote`, production `database_id` in test configs.

## 5. L3 Playwright

```
packages/ui/e2e/*.pw.ts
```

Core paths:

1. Auth bypass (test mode) → Dashboard shell visible
2. Create watchlist → create push token → push x.com + custom items → mixed timeline
3. Groups CRUD smoke
4. AI Settings save (mock)
5. zhe.to integration page loads (credential form)

Run against:

- UI: vite preview or dev
- API: wrangler local on known port
- Isolated persist directory

`testMatch: "*.pw.ts"` (avoid vitest picking Playwright files).

## 6. G1 / G2

| Gate | Command |
|------|---------|
| G1 | `bun run typecheck` && `bun run lint` (biome) |
| G2 | `osv-scanner` + `gitleaks protect` / CI |

## 7. D1 isolation checklist

- [ ] `wrangler.toml` env `test` or separate database_name `xray-db-test`
- [ ] CI secrets do not include prod D1 write tokens for test jobs
- [ ] Scripts refuse `WRANGLER_ENV=production` when `NODE_ENV=test`
- [ ] Documented port matrix:

| Mode | Port |
|------|------|
| UI dev | 7007 (or vite 7007 with proxy) |
| Worker local | 7007 / 8787 — finalize in impl |
| L2 | dedicated persist |
| L3 | dedicated persist |

(Align final ports with Caddy `xray.dev.hexly.ai → 7007`.)

## 8. Test data factories

```ts
factories.user()
factories.watchlist(userId)
factories.member(watchlistId, { username: "alice" })
factories.canonicalPost({ created_at: hoursAgo(3) })
```

All L1/L2 use factories; no copy-paste SQL blobs except migrations.

## 9. Definition of done (per feature slice)

1. L1 tests green for domain/VM
2. L2 HTTP covers new endpoints
3. L3 path if user-visible
4. Biome + tsc clean
5. No TweAPI references (`rg -i tweapi` → 0 in non-legacy)
