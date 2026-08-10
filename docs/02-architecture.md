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

### Deploy topology

```
Browser ──HTTPS──► Cloudflare Access (Google) ──► CF Worker (Hono)
                                                    ├─ /api/*  Worker
                                                    └─ /*      ASSETS (Vite → static)
                                                    └─ D1
External agent ──Bearer push token──► /api/ingest/push  (Access bypass for this route)
```

`wrangler.toml`: assets SPA + `run_worker_first = ["/api/*"]` + D1 (+ `xray-db-test` for L2/L3).

Local: **`xray.dev.hexly.ai` → 7007** (Caddy). UI vite + worker wrangler dev (bat-like).

## 2. Tech stack (locked)

| Layer | Choice |
|-------|--------|
| Language | TypeScript **7** |
| Lint | **Biome** |
| UI | **Vite 8 + React 19 + react-router** + Tailwind 4 + existing tokens |
| API | **Hono 4** on Workers |
| DB | **CF D1** + SQL migrations |
| Auth | **CF Access** JWT verify (`jose` + team JWKS) — bat/surety pattern |
| AI | Vercel AI SDK + **gecko / `@nocoo/next-ai` patterns** (worker-safe server helpers + Basalt-like settings UI) |
| Test | vitest + Playwright + mock-d1 / wrangler `--local` |

## 3. Auth — Cloudflare Access

### Browser (Dashboard)

1. User hits `xray.hexly.ai` / `xray.dev.hexly.ai`.
2. CF Access enforces Google login (IdP).
3. Edge injects `Cf-Access-Jwt-Assertion`.
4. Worker `accessAuth` middleware:
   - verifies JWT (aud, iss, signature via Access certs)
   - extracts email/identity
   - optional allowlist (`ALLOWED_EMAILS` or Access policy already restricts)
   - upserts `users` row; sets `c.var.user`
5. **No** NextAuth / app Google OAuth client for session.

### API push (agents)

- Route `/api/ingest/push` (and token CRUD only from browser) uses **Bearer push token**, **not** Access JWT.
- Pattern from bat: browser+Access mints token; CLI stores token; API host may skip Access for `/api/ingest/*` or use separate route policy.

### Local / test

- `E2E_SKIP_AUTH=true` or signed test JWT / mock middleware (fail-closed when unset in prod).
- Never disable verify in production builds.

Reference implementations:

- `../bat/packages/worker/src/middleware/access-auth.ts`
- `../bat/packages/worker/src/routes/cli-auth.ts` (token mint)
- `../surety/apps/worker/src/middleware/access-auth.ts`

## 4. MVVM (UI)

```
packages/ui/src/
├── app/              # router, providers, shell
├── views/
├── viewmodels/       # no DOM
├── components/       # ported visuals
├── models/
└── lib/
```

Rules unchanged: View ↔ VM I/O only; VM unit-tested; no fetch inside pure presentational components without injected port.

## 5. Worker layers

```
routes → domain / ingest / ai → repos → D1
middleware: accessAuth | pushTokenAuth
```

Multi-tenant: every business row `user_id`; repos scoped at construction.

## 6. Ingest model (push-first, no auto refresh)

```
External producer                Worker
─────────────────                ──────
twitter-cli / hermes / ...
        │
        │  POST /api/ingest/push
        │  Authorization: Bearer xray_...
        ▼
  pushTokenAuth → resolve user_id
        │
        ▼
  validate envelope (source_type, items[])
        │
        ▼
  normalize per source_type → CanonicalItem
        │
        ▼
  WindowGate (default 24h, optional)
        │
        ▼
  upsert posts (watchlist_id, source_type, external_id)
        │
        ▼
  optional AI if watchlist.translate_enabled
```

**There is no CF Cron** and no platform-scheduled pull in v2.  
UI may expose “waiting for push” empty states; optional later “copy curl for push” helper.

Pull adapters (X official API) are **out of MVP** but ports stay open in shared types.

## 7. AI

- **UI**: dedicated **AI Settings** page (not buried only under generic Settings).
- Reuse **gecko AI settings UX** and `@nocoo/next-ai` design:
  - multi-provider registry
  - masked API key
  - prompt templates
  - test connection
- **Worker**: server-only completion/stream helpers (AI SDK); do not import Next `server-only` paths that break Workers — fork/adapt package surface if needed (`@xray/ai` thin wrapper over same ideas).
- Storage: D1 `settings` / dedicated `ai_configs` table via adapter interface.

## 8. Push tokens

| Concern | Design |
|---------|--------|
| Storage | `push_tokens` (id, user_id, token_hash, label, scopes, created_at, last_used_at, revoked_at) |
| Mint | Browser session + Access only; return plaintext **once** |
| Use | `Authorization: Bearer` on push routes; constant-time hash compare |
| UI | Settings → **Push tokens** (list/create/revoke) |
| Scope | e.g. `ingest:push` ; optional watchlist allow-list later |

Align with bat `cli_tokens` security notes (no mint via bearer).

## 9. zhe.to

Keep integration module: save bookmark from tweet/item card → zhe.to API with user-configured credential in settings/integrations. No TweAPI dependency.

## 10. Config & secrets

| Name | Purpose |
|------|---------|
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Access JWT verify |
| `ALLOWED_EMAILS` | optional extra gate |
| `AUTH` test flags | local/e2e only |
| AI keys | user settings in D1 (encrypted at rest if we add; MVP can store server-side only via Access-protected API) |
| zhe.to credentials | per-user settings |

## 11. Local dev

```bash
# worker
cd packages/worker && bunx wrangler dev --port 7007 --local
# ui
cd packages/ui && bun run dev   # proxy /api → worker; allowedHosts xray.dev.hexly.ai
```

Access: use CF Access service token headers on vite proxy **or** dev bypass middleware.

## 12. Dropped from v1 architecture

- vinext, NextAuth `/api/xauth`, bun:sqlite dual driver
- TweAPI provider factory
- Railway volume
- App-level Google OAuth session cookies as primary auth
- Auto-fetch intervals / SSE fetch-from-provider loops driven by server cron
