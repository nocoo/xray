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
  local: true;
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

## Ownership and work streams

| Owner | Files |
|---|---|
| Coordinator | `scripts/envs*`, `packages/ui/dev/`, Vite, manifests, Wrangler config, L2/L3 harness and integration, handbook/CI |
| Worker agent | `packages/worker/src/` auth, external transport, related tests; no fixture SQL or harness |
| UI agent | `packages/ui/src/` environment, controls, request paths, draft guards, related tests |
| Fixture agent | `fixtures/`, old SQL/debug seed replacement, `src/test/mock-data.test.ts`, feature matrix |

Agents do not stage/commit concurrently. The coordinator reviews, runs required
checks and makes explicit-path atomic commits for coherent working stages.

## Implementation status

- [ ] Native local vertical slice with signed authentication and CRUD.
- [ ] Owned Demo/E2E storage, migrations, seed/reset, guarded cleanup.
- [ ] Local-only control, persistence, fixed request targets and E2E lock.
- [ ] Rich deterministic fixtures and provider success/failure scenarios.
- [ ] Managed L2/L3, obsolete path removal and CI integration.
- [ ] Local build, quality checks, browser acceptance and recorded evidence.

## Verification record

Planning only at baseline. No implementation checks have run yet. Record actual
commands and results here as each stage completes; never infer success from source.
