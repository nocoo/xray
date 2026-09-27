# 06 — Testing (6DQ)

## 1. Contract and current evidence

6DQ consists of unified L1 (including the former G1), L2/L3, G2 and D1 isolation. Keep configured enforcement separate from execution evidence.

| Dimension | Contract | Current implementation / evidence |
|-----------|----------|-----------------------------------|
| **L1** | Unit tests; statements, branches, functions and lines each ≥95%; strict Biome/typecheck; index-snapshot pre-commit rejection under 30s | Coverage/static subchecks run in hooks and CI. Hooks still inspect the working tree; snapshot scope, rejection proof and timing remain unverified |
| **L2** | Native Worker HTTP, tenant/SQL assertions and full endpoint/method inventory | Managed fresh E2E Worker plus `gate:routes`; 41/41 tests across six files passed on 2026-09-27, including native isolation/cleanup; route inventory 62/62 |
| **L3** | Critical browser/agent journeys on owned local data | Final combined managed run passed 25/25 tests in 2.4 minutes on 2026-09-27 and completed cleanup; CI Chromium job configured, CI execution unverified |
| **G2** | Required dependency and secret scanning | Pre-push OSV/gitleaks and CI; push hook scans repository history rather than exact pushed refs |
| **D1 isolation** | Per-run local resources, owned paths, marker checks before fixture writes/cleanup | Runtime owns fresh E2E state and generated configuration; six native concurrency/cleanup tests passed 2026-09-27, covering distinct paths/identities, CRUD/SQL isolation, cross-run JWT rejection, locks/ownership, foreign/symlink paths and marker mismatch |
| **Build** | Complete shared/UI/Worker bundle | Included in `bun run test:l3` and therefore the configured L3 CI job; no CI execution is claimed |

The environment change has no recorded visual acceptance or CI run. Keep revision-specific results in [12 — Local environments](12-local-environments.md); historical feature results do not validate the new harness.

### Authentication and provider boundaries

Demo/E2E use signed fixture JWTs and the production verifier, including issuer, audience, expiry, email policy and stable tenant binding. The runtime generates a local public JWKS and isolated identities. Browser mutations retain Origin protection; producer requests use normal scoped Bearer tokens. Production rejects local JWKS, presentation time and external fixture bindings.

Native `XRAY_EXTERNAL` fixtures replace known provider transport while leaving URL validation, request construction, response parsing and authorization in place. Unit transport stubs remain L1 helpers. Channel images remain external HTTPS links. Fixture and scenario coverage lives in [13 — Environment fixtures](13-environment-fixtures.md).

### Tenant isolation matrix

Apply to watchlists, groups, items, tokens, logs, AI configuration, zhe.to, channels, reports and tags:

| Actor A | Action on B's resource | Expect |
|---------|------------------------|--------|
| Verified browser identity A | GET/PATCH/DELETE | 404 |
| Push token A | Push to B's watchlist | 404 |
| Push token A | GET `/api/v1/ingest/graph` | A's graph only |
| Revoked token A | Graph or push | 401 |
| Token missing required scope | Graph, push or channel article submission | 403 |
| Browser identity A | Channel/key tag assignment | Tenant-validated, atomic replacement |

## 2. L1 scope and static checks

| Package | Include | Explicit exclusions |
|---------|---------|---------------------|
| shared | Declared `src/**/*.ts` domain surface | Barrel and type-only boundary |
| worker | Declared `lib`, `middleware`, `repos`, `routes` | Test helpers and `handle` re-export |
| ui | `dev/**/*.ts`, ViewModels, pure libraries, API clients, hooks | Tests, View shells, React binders and declared type/static modules |

Package Vitest configurations are authoritative for exact patterns. All four metrics must be ≥95%; `scripts/check-coverage.sh 95 95 95` applies the same branch floor to every package. Do not reduce thresholds, skip tests or infer subprocess coverage from a parent runner.

Use red-green-refactor, fixtures for every adapter, and table-driven 401/403/404 cases. Keep UI ViewModels free of View/DOM imports and cover meaningful boundaries and failures. D1-shaped stubs and local gateway HTTP tests with mocked runtime transport are L1. Native Worker/D1 HTTP is L2.

```bash
bun run build:shared
bun run test:coverage
bun run typecheck
bun run lint
```

## 3. L2 native HTTP

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l2
```

`test:l2` runs the Worker `test:e2e` suite and then `gate:routes`. `packages/worker/test/e2e/global-setup.ts` calls `startLocalRuntime("e2e")`, provides the allocated URL and signed A/B identities to the tests, and closes the owned runtime afterward. Cases live beside the setup and use `vitest.e2e.config.ts`.

The runtime uses native Wrangler/D1, production migrations, a unique `e2e-*` directory and dynamic ports. It rejects inherited production credentials and generates its own configuration and secret file inside the run directory. It does not rewrite the daily `.dev.vars` or reuse a fixed test store. The endpoint inventory remains a separate required gate; mocked route tests cannot replace it.

## 4. L3 managed Playwright

Install the declared Playwright Chromium browser once, then use the managed command:

```bash
bun x --no-install playwright install chromium
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l3
```

`test:l3` builds shared/UI/Worker output and calls `scripts/test-l3.ts`. The harness starts a fresh automated E2E Worker and built-asset gateway on allocated ports. It supplies `PLAYWRIGHT_BROWSER_URL`, `PLAYWRIGHT_WORKER_URL`, `PLAYWRIGHT_INGEST_URL`, signed fixture identities and `XRAY_E2E_MANAGED=1` to Playwright, then cleans up its resources on exit. The config rejects direct unmanaged invocation; do not supply daily-dev or production addresses manually.

`e2e/*.pw.ts` run serially with Chromium, retained failure traces and screenshots. CI allows one retry and forbids focused tests. The launcher locks E2E server-side; local controls show the lock, while cloud CI returns `local:false` and hides the controls. Automated runs do not read or overwrite interactive preferences and never receive Prod credentials.

The final combined local run passed all 25 tests on 2026-09-27, including environment lock/preferences, hosted hidden controls and responsive reader geometry. The runner exited 0 and completed cleanup; artifacts are in `/tmp/xray-fixture-l3-final`. This is local execution evidence, not a CI run or visual acceptance.

The CI L3 job reuses the pinned `base-ci` test workflow with `browser: chromium`, which runs Playwright's maintained `install --with-deps` command. It invokes `bun run test:l3` without secrets. Job configuration is present; CI execution remains unverified. Scoped Chrome/Caddy acceptance and six capture reviews are recorded in [local environments](12-local-environments.md); a complete visual audit remains unverified.

## 5. Resource lifecycle

The local gateway is 7007 behind `https://xray.dev.hexly.ai` for interactive preview only. Workers, inspectors and automated gateways use allocated ports.

- Demo: `packages/worker/.wrangler/environments/demo`, persistent native D1 under `d1/`.
- E2E: fresh `packages/worker/.wrangler/environments/e2e-*` per run, disposable native D1 under `d1/`.
- Ownership: canonical path checks, `owner.json`, exclusive `active.lock`, generated local-only bindings and matching `_test_marker`.
- Cleanup: owned runtime only; seeded state requires owner/mode marker validation. Stop Demo before explicit reset. Preserve the retired `.wrangler/state-mock` store untouched.

Six native tests in `packages/worker/test/e2e/environment-isolation.test.ts` passed on 2026-09-27, including concurrent runtimes, guarded refusal and owned cleanup. The full updated L2 suite also passed 41/41 with cleanup; these checks do not claim every failure mode is covered. See [architecture](02-architecture.md) and [runtime contract](12-local-environments.md).

## 6. Hooks and CI

| Gate | Pre-commit | Pre-push | CI |
|------|------------|----------|----|
| Unified L1 unit coverage + strict static checks | Working tree; required | — | Configured |
| gitleaks | Staged; optional if binary absent | Required repository-history scan | Configured |
| L2 + endpoint inventory | — | Required | Configured |
| OSV | — | Required | Configured |
| L3 + full build | — | — | Configured managed Chromium job; execution unverified |

Pre-commit remains short of the unified index-snapshot, rejection and timing contract. Pre-push runs L2, gitleaks and OSV sequentially; exact pushed-ref scoping and the parallel <3-minute target remain gaps. Hooks are check-only: no disabled gates, `--no-verify`, automatic fixes or lowered floors.

Direct push CI runs after landing and cannot retroactively block a push. Authorized releases require exact-revision validation; a configured CI job is not a successful run. A user-visible feature is complete only with its relevant L1/L2/L3 and build/static evidence; visual acceptance must be recorded separately.
