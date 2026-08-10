# 02 — Architecture

## 1. Target shape (bat-class monorepo)

```
xray/
├── package.json                 # workspaces, biome, turbo, version
├── biome.json
├── turbo.json
├── docs/
├── packages/
│   ├── shared/                  # @xray/shared — types, source enums, canonical item
│   ├── ui/                      # @xray/ui — Vite React SPA (MVVM)
│   └── worker/                  # @xray/worker — Hono + CF Workers + D1
└── scripts/                     # migrate-v1-to-d1 (no TweAPI agents)
```

| Package | Responsibility | Forbidden |
|---------|----------------|-----------|
| `@xray/shared` | SourceType, canonical item, DTOs, pure mappers | I/O, React, Workers |
| `@xray/ui` | Views + ViewModels + API client | D1, secrets, raw ingest crypto |
| `@xray/worker` | HTTP, Access auth, push tokens, repos, AI, zhe.to proxy | React |

### Deploy topology (locked — XR-01)

**Two hostnames, one Worker service** (bat dual-domain pattern):

| Hostname | CF Access | Traffic |
|----------|-----------|---------|
| **`xray.hexly.ai`** (prod browser) | **Required** (Google IdP) | SPA + browser `/api/*` except never used for agent push |
| **`xray-ingest.hexly.ai`** (prod agents) | **Bypass / no Access app** | **Only** `POST /api/v1/ingest/push` (+ optional `GET /api/live`) |
| **`xray.dev.hexly.ai`** (local via Caddy) | Dev bypass in Worker | Browser + local tests |
| Local wrangler | `AUTH_DEV_BYPASS` | L2/L3 |

```
Browser ──HTTPS──► CF Access (Google) ──► xray.hexly.ai ──► Worker
                                                      ├─ /api/* (Access JWT)
                                                      └─ /* ASSETS

Agent  ──HTTPS + Bearer──► xray-ingest.hexly.ai ──► same Worker
                              (no Access edge)
                              └─ POST /api/v1/ingest/push only
                                 (Worker still runs pushTokenAuth;
                                  reject other paths with 404)
```

**Locked rules**

1. Agents **must not** call `xray.hexly.ai` for push (Access would block Bearer-only clients).
2. Ingest host **must not** serve the SPA dashboard; path allowlist in Worker: push + live only.
3. Token **mint/list/revoke** only on browser host under Access — never on ingest host.
4. Production smoke: (a) browser login on `xray.hexly.ai`; (b) `curl -H "Authorization: Bearer …" https://xray-ingest.hexly.ai/api/v1/ingest/push` succeeds; (c) same curl to `xray.hexly.ai` fails at Access or is not the documented path.
5. `workers.dev` preview: document separately; default off for prod data.

`wrangler.toml`: assets SPA + `run_worker_first = ["/api/*"]` + D1 (`xray-db`) + test DB name `xray-db-test`.

Local: **`xray.dev.hexly.ai` → 7007** (Caddy). UI vite + worker wrangler dev.

## 2. Tech stack (locked)

| Layer | Choice |
|-------|--------|
| Language | TypeScript **7** |
| Lint | **Biome** |
| UI | **Vite 8 + React 19 + react-router** + Tailwind 4 + existing tokens |
| API | **Hono 4** on Workers |
| DB | **CF D1** + SQL migrations |
| Auth | **CF Access** JWT verify (`jose` + team JWKS) — bat/surety pattern |
| AI | Vercel AI SDK + gecko / `@nocoo/next-ai` patterns (worker-safe) |
| Test | vitest + Playwright + mock-d1 / wrangler `--local` |

## 3. Auth — Cloudflare Access

### Browser (Dashboard) — `xray.hexly.ai`

1. CF Access enforces Google IdP (Access **policy must restrict to allowed emails/groups** — not “any Google user”).
2. Edge injects `Cf-Access-Jwt-Assertion`.
3. Worker `accessAuth`:
   - verifies JWT (aud, iss, signature via Access certs)
   - extracts **`sub` (required)** + email
   - **Worker `ALLOWED_EMAILS` is mandatory second gate** (defense in depth; fail closed if unset in prod)
   - upserts `users`: if row exists by email (migrated), bind `access_iss`/`access_sub`; else insert new
4. Browser mutating APIs: require Access session + **same-origin** (check `Origin`/`Sec-Fetch-Site`); no Bearer mint via CORS wildcards.

### Identity (XR-02, R2-01)

| Field | Rule |
|-------|------|
| `users.id` | stable internal UUID |
| `access_iss` + `access_sub` | **both NULL** (pre-Access migrated) **or both non-NULL**; UNIQUE partial index when bound |
| `email` | NOT NULL, unique lower-case; migration match key |
| First Access login | bind iss/sub onto email-matched row |
| Email change | same `sub` updates email; never second user for same sub |
| Conflict | migration dry-run; `--map` file |

### Push agents — `xray-ingest.hexly.ai` (XR-01)

- **Only** `POST /api/v1/ingest/push` with `Authorization: Bearer <push_token>`.
- Worker `pushTokenAuth`: hash lookup → `user_id`; scopes must include `ingest:push`.
- **Not** Access JWT.

### Token CRUD — browser host only

- `GET/POST /api/push-tokens`, `DELETE /api/push-tokens/:id`
- Access session required; Bearer tokens **cannot** mint/revoke tokens.

### Local / test auth switch (XR-21)

| Env | Meaning |
|-----|---------|
| `AUTH_DEV_BYPASS=true` | **Only** when `ENVIRONMENT` is `development` or `test`. Injects fixed test identity. |
| Production | If `AUTH_DEV_BYPASS` set → **Worker refuses to boot** / every request 500. |
| L2/L3 | Use bypass + isolated D1 persist `.wrangler/state-l2` / `state-l3` |

Do **not** use alternate names (`E2E_SKIP_AUTH`); single switch only.

### Ports (locked)

| Mode | Port | Persist |
|------|------|---------|
| UI dev | 7007 (or vite 5173 proxied via Caddy 7007) | — |
| Worker local | 8787 behind Caddy → public 7007 | `.wrangler/state` |
| L2 | worker 18787 | `.wrangler/state-l2` |
| L3 | worker 28787 | `.wrangler/state-l3` |

## 4. MVVM (UI)

```
packages/ui/src/
├── app/              # router, providers, shell
├── views/
├── viewmodels/       # no DOM
├── components/
├── models/
└── lib/
```

View ↔ VM I/O only; VM unit-tested.

## 5. Worker layers

```
routes → domain / ingest / ai → repos → D1
middleware: accessAuth | pushTokenAuth | originCheck
```

**Tenant isolation (XR-13)**: every business query includes `user_id` from auth context — never from client body for authorization. Shared L2 matrix: cross-user GET/PATCH/DELETE/push/logs/AI/zheto → **404** (no existence leak).

## 6. Ingest model (push-first, no auto refresh)

```
Agent → xray-ingest.hexly.ai
  POST /api/v1/ingest/push + Bearer
       → pushTokenAuth
       → validate + limits (XR-08)
       → normalize → CanonicalItem (discriminated)
       → WindowGate
       → insert items (dedupe XR-16); ai_status = not_requested
       → ingest_logs
       → **no AI on ingest path** (R2-02)
```

### AI execution model (XR-06, R2-02) — locked MVP

| Mode | MVP |
|------|-----|
| Ingest path | **Never** run or enqueue AI |
| Translate/summary | **Only** manual UI: `POST /api/watchlists/:id/translate` with `limit ≤ 20` **synchronous** bounded batch |
| Status | per-item `ai_status`: `not_requested \| pending \| succeeded \| failed` |
| Retry | user re-triggers; failed keeps `translation_error` |
| Future | CF Queue/Workflow optional; not MVP |

### Limits (XR-08) — locked

| Limit | Value |
|-------|-------|
| Max body bytes | 1 MiB |
| Max items / request | 50 |
| Max text length / item | 20_000 UTF-16 code units |
| Max meta JSON | 8 KiB |
| Rate limit | 60 req/min per push token (429 + Retry-After) |
| Rate limit backend (R2-06) | **Cloudflare Rate Limiting binding** `XRAY_INGEST_RL` on Worker (not in-memory). L2 tests mock binding. |
| URL schemes | `https:` only in custom.url / media |
| custom.text | markdown subset; **strip raw HTML**; render with sanitizer; external links `rel=noopener noreferrer` |

## 7. Secrets storage (XR-07, R2-07) — locked

| Secret | Storage |
|--------|---------|
| AI API keys, zhe.to tokens | D1 BLOB envelope (below); KEK = Worker secret `XRAY_SECRETS_KEK` (32-byte) |
| Push token plaintext | shown **once**; store `token_prefix` + **SHA-256** hex `token_hash` only |
| Logs | never log bearer, AI key, zhe credentials, full payloads |

### Envelope format (WebCrypto)

```
ciphertext_blob :=
  key_version:uint8
  || nonce:12 bytes          # AES-GCM
  || ciphertext+tag          # AES-256-GCM
AAD := utf8(user_id || ":" || field_name)   # e.g. userId:ai.api_key
```

- Algorithm: **AES-256-GCM** via WebCrypto.
- KEK never leaves Worker env; no DEK wrap hierarchy in MVP (direct KEK encrypt).
- Rotate: dual-KEK read (`XRAY_SECRETS_KEK` + `XRAY_SECRETS_KEK_PREV`); rewrite on next save.
- Corrupt/decrypt fail → 500 with code `secrets_corrupt`; never return ciphertext to client.

## 8. Push tokens

| Concern | Design |
|---------|--------|
| Table | `push_tokens` (see 03) |
| Mint | Browser + Access only; return plaintext once |
| API | `GET /api/push-tokens`, `POST /api/push-tokens`, `DELETE /api/push-tokens/:id` |
| UI | Settings → Push tokens |

## 9. zhe.to

Full port of v1 behavior — contract in [04](04-features.md) §5.

## 10. Observability (XR-24) — minimum

| Signal | Requirement |
|--------|-------------|
| request_id | UUID per request; response header `x-request-id` |
| Structured logs | route, user_id hash, status, duration_ms, error code |
| Metrics (log-based OK MVP) | ingest accepted/rejected, AI fail rate, zheto fail |
| Alerts | optional Uptime on `/api/live` both hosts |
| Redaction | tokens/keys/payloads never logged |

## 11. Config & secrets

| Name | Purpose |
|------|---------|
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | browser JWT verify |
| `ALLOWED_EMAILS` | mandatory Worker allowlist |
| `XRAY_SECRETS_KEK` | envelope encryption |
| `ENVIRONMENT` | `development` \| `test` \| `production` |
| `AUTH_DEV_BYPASS` | test/dev only |

## 12. Quality gates on main (XR-14, R2-04) — locked

Direct pushes to `main` are allowed (D8). **CI cannot block a direct `git push` after the fact.** Hard gates:

| Gate | When | Blocks |
|------|------|--------|
| pre-commit L1+G1+gitleaks | every local commit | commit |
| **pre-push L2+G2** | every `git push` to main | **push** (primary gate) |
| CI GHA L1/L2/G1/G2 | after push / on PR | status check; release blocked if red |
| L3 Playwright | CI after S5; **release/M8 blocked** if red | release |

Rules:

1. Do **not** claim CI prevents bad commits from landing on main under direct-push.
2. Developers **must not** `--no-verify` on push without documented emergency.
3. Optional short-lived PR still welcome; if used, required checks apply before merge.
4. `release: 2.0.0` / prod DNS cutover **requires green CI including L3**.

## 13. Release / cutover checklist (XR-23)

See [07](07-implementation-plan.md) M8 expanded runbook: bindings, migrations order, Access apps (browser + ingest bypass), DNS, smoke, rollback (Worker version rollback + D1 export restore).

## 14. Dropped from v1

vinext, NextAuth, TweAPI, Railway volume, app Google OAuth session, auto-fetch cron.
