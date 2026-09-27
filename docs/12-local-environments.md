# Local application environments

Shared contract: [system0-envs](../../workflow/tasks/system0-envs/SKILL.md).
Implementation baseline: `9b4e775bd65658c559e8ab1f72563dc5cdfa2a08` (2.5.5).

## Decisions

- Demo uses persistent native local D1; E2E owns fresh state per run. Preserve
  `.wrangler/state-mock` without importing or deleting it.
- Use the production application, migrations and authorization in every mode.
  Replace local auth bypass with signed fixture identities and real JWT verification.
- Keep one interactive session at `https://xray.dev.hexly.ai`. Accepted switches
  invalidate old instance requests instead of redirecting them to another backend.
- Local E2E is locked until shutdown. Automated E2E has no production credentials.
- The local launcher serves both Vite and built assets. Hosted bundles have no local
  capability and never read environment preferences.
- Production verification and publication are outside this implementation.

## Runtime/UI contract

Mode values are `demo`, `e2e`, `prod`; visible segments are `Demo`, `E2E`, `Prod`.
The local launcher injects `window.__XRAY_LOCAL__ = true` into HTML only.
The UI initializes before mounting React. Hosted HTML has no injected capability.

`GET /__local/environment` returns JSON directly:

```ts
type LocalEnvironment = {
  local: boolean;
  mode: "demo" | "e2e" | "prod" | null;
  locked: boolean;
  automated: boolean;
  instanceId: string | null;
  csrfToken: string;
  ingestBase: string | null;
};
```

`POST /__local/environment/select` accepts `{ mode, instanceId }` and the
`X-Xray-Local-Csrf` header, returning the accepted descriptor. The server validates
Host, Origin, CSRF and the current instance. E2E refuses every target except its
current E2E instance. The server only accepts configured enum targets.

Startup order: E2E lock, explicit launcher mode, valid
`localStorage["xray:environment-mode"]`, Demo. Only accepted interactive choices
are persisted. Automated runs neither read nor write this preference.
Cloud CI uses a fixed E2E descriptor with `local: false`, hiding the control.

An accepted descriptor fixes the client target for its lifetime. All local API
and media proxy paths use `/__local/instances/<instanceId>/api/...`; the launcher
rejects stale IDs. Hosted requests retain `/api/...`. The local descriptor supplies
the actual isolated ingest URL. Switching checks dirty forms and returns to `/`.

## Worker resource contract

Local configs provide `ENVIRONMENT=development|test`, Access issuer/audience,
`XRAY_LOCAL_JWKS` (public JWKS JSON), and `XRAY_PRESENTATION_TIME` (ISO timestamp).
The JWT signature, issuer, audience, expiry, email policy and stable identity
binding are still verified. Production rejects local JWKS and presentation time.
Local issuer: `https://identity.xray.test`; audience: `xray-local`.
Demo subject/email: `demo-owner` / `owner@xray.test`; second tenant:
`demo-other` / `other@xray.test`. E2E generates fresh run-specific subjects/emails.

Local external responses are selected through a native service binding
`XRAY_EXTERNAL`. All existing URL validation and response parsing remain active.
The fixture service handles only known provider requests, denying unknown egress.
Production has no fixture binding. Rate-limit scenarios use the native binding.
Authentication clocks remain real; presentation time is separately injected.

## Source map and lifecycle

| Responsibility | Source |
|---|---|
| Native Worker, signed identities, owned D1, migrations and cleanup | `packages/worker/dev/local-runtime.ts` |
| Local descriptor, fixed-instance proxy, Vite/built assets, authenticated Prod proxy | `packages/ui/dev/local-server.ts` |
| Startup and explicit Demo database operations | `scripts/envs.ts` |
| Pre-React environment, enum preference, immutable API paths | `packages/ui/src/lib/environment.ts`, `src/main.tsx` |
| Basalt control and shared draft guard | `packages/ui/src/components/layout/environment-switch.tsx`, `src/lib/unsaved-drafts.ts` |
| Real JWT verification and external Fetch boundary | `packages/worker/src/middleware/access-auth.ts`, `src/lib/external.ts` |
| Shared primitives, rich catalog, provider responses and approved media | `fixtures/`; [feature matrix](13-environment-fixtures.md) |
| Managed L2/L3 and captures | `packages/worker/test/e2e/global-setup.ts`, `scripts/test-l3.ts`, `scripts/capture-demo.ts` |

Demo persists at `packages/worker/.wrangler/environments/demo`; every E2E run
gets an `e2e-*` sibling. The runtime validates the canonical path and persisted
owner metadata, takes an exclusive lock, and writes a private per-run Wrangler
configuration. It uses native local D1 and the production migrations. A matching
owner/mode `_test_marker` is required before seeded writes and cleanup. Stale
metadata, symlinks, foreign paths, active owners and inherited Prod credentials
are rejected. Daily `.dev.vars` and the retired store are untouched.

Initial rich seed uses plain inserts. Restarts preserve edits; catalog replacement
requires explicit reset. Fixture AI/webhook settings pass through the real
encrypted settings APIs. E2E starts empty unless a disposable capture explicitly
requests the Demo catalog. Cleanup stops owned children and removes only owned
E2E state. Failed marker verification remains visible and allows a retry after
the marker is restored. A failed switch retains cleanup references, and shutdown
waits for pending runtime allocation. Stream errors abort their response without
terminating the gateway.

Removed paths include `AUTH_DEV_BYPASS`, client data-mode/MOCK logic, the old
product proxy, fixed test stores, actor/forced-rate headers, provider domain
injectables, business API interception, `scripts/mock-data.sql` and
`scripts/seed-debug-feed.ts`. Their useful canonical content now lives in fixtures.
Local producers use the descriptor's explicit ingest base; the obsolete fixed
`--env dev` endpoint is rejected. No compatibility fallback selects Production.

## Commands

Run from the repository root. Stop the interactive stack before Demo DB commands.

```sh
bun run dev -- --mode demo
bun run dev -- --mode e2e
bun run preview -- --mode demo
bun run env:db init --mode demo
bun run env:db migrate --mode demo
bun run env:db seed --mode demo
bun run env:db reset --mode demo
bun run test:coverage
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l2
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l3
bun run capture:demo
```

`init` starts the initial catalog; `migrate` applies outstanding migrations while
preserving an existing catalog; `seed` rejects an already seeded store; `reset`
deletes owned Demo edits and builds a fresh catalog. Tests manage startup,
authenticated readiness, endpoints and cleanup. The L3 and capture aliases build
first. `bun run dev` without a mode lets the browser resolve its saved preference.
Interactive acceptance uses Google Chrome at `https://xray.dev.hexly.ai`.

Local Prod is implemented but not exercised against live infrastructure. Its
separate commands are `bun run login:prod` and `bun run dev -- --mode prod`;
live verification requires authorized real operations.

## Implementation status

- [x] Native local vertical slice with signed authentication and CRUD.
- [x] Owned Demo/E2E storage, migrations, seed/reset, guarded cleanup.
- [x] Local-only control, persistence, fixed request targets and E2E lock.
- [x] Rich deterministic fixtures and provider success/failure scenarios.
- [x] Managed L2/L3, obsolete path removal and CI configuration.
- [x] Local build, quality checks, scoped Chrome acceptance and recorded evidence.

## Verification record

Executed on 2026-09-27 against the implementation worktree based on `d63f238`:

| Check | Actual result |
|---|---|
| Full build | `bun run build` passed shared/UI/Worker output; Worker deploy command used local `--dry-run` only |
| L1 | Full `bun run test:coverage`, strict lint and typecheck passed; all four package coverage metrics remain at least 95% |
| Latest UI regression coverage | 253 tests / 45 files passed; statements 98.84%, branches 96.63%, functions 99.01%, lines 99.45% |
| Worker L1 | 479 tests / 60 files passed; statements 98.62%, branches 96.17%, functions 97.24%, lines 99.71%; includes nine fixture checks |
| L2 | Full native suite 41 tests / 6 files passed in 26.89s with cleanup; route inventory 62/62 |
| Isolation regressions | Six native checks passed, including concurrent runtimes/CRUD/D1, cross-run JWT denial, lock/path/symlink refusal, stale owner flags, corrupt-marker refusal and cleanup retry |
| L3 | Full managed suite 25/25 passed in 2.4 minutes, exit 0 and cleanup; actual runner `bun scripts/test-l3.ts --output=/tmp/xray-fixture-l3-final` after a successful full build |
| Gateway regressions | 26 local HTTP tests passed, including failed switch cleanup, late startup/shutdown, partial stream errors, fixed targets and mocked Prod credential handling |
| Demo database CLI | Explicit reset and migrate passed; replayed seed rejected with exit 1 |
| Chrome/Caddy acceptance | Demo record survived restart and was removed afterward; draft cancellation/confirmation, stale API 409, manual E2E lock, saved preference and fresh remembered E2E passed |
| Captures | Full build plus `bun scripts/capture-demo.ts` completed; six surfaces captured with loaded images and owned cleanup |

Local evidence: `/tmp/xray-l2-with-isolation.log`,
`/tmp/xray-l2-isolation-stale-owner.log`, `/tmp/xray-ui-coverage-gateway.log`,
`/tmp/xray-fixture-l3-final`, `reports/environment-acceptance/result.json`, and
`reports/captures/2026-09-27T06-44-05.035Z/manifest.json`.
Capture metadata truthfully records revision `d63f238` with `dirty: true`, fixture
version 1, 1440×1000 viewport, `en-US`, UTC and the fixed presentation anchor.
Reviewed surfaces are enumerated separately in the fixture matrix.

CI execution, real Prod/Access/MFA/provider availability, video playback and a
complete visual/accessibility audit remain unverified. Existing unified L1
index-snapshot/rejection/timing and G2 exact-push-ref/parallelization gaps remain;
this change does not claim complete 6DQ certification.
