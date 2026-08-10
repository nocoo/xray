# X-Ray

Twitter/X content monitoring — **v2 rewrite** (CF Workers + D1 + Vite).

> Design package: [`docs/`](docs/). Archived vinext app: [`legacy/v1/`](legacy/v1/).  
> Progress: [`docs/07-implementation-plan.md`](docs/07-implementation-plan.md).

## Local dev

```bash
bun install
bun run dev          # builds @xray/shared, then UI :7007 + worker :8787
# or
bun run dev:ui       # Vite SPA (proxies /api → 8787)
bun run dev:worker   # wrangler dev --env development
```

- UI: http://localhost:7007 or https://xray.dev.hexly.ai (Caddy → 7007)
- Worker live: http://127.0.0.1:8787/api/live

## Build / deploy

```bash
bun run build        # shared → ui (writes worker/static) → worker
bun run deploy       # build then wrangler deploy --env production
```

## Packages

| Package | Role |
|---------|------|
| `@xray/shared` | types, nav, version |
| `@xray/ui` | Vite React SPA |
| `@xray/worker` | Hono on Cloudflare Workers |

## Version

Root `package.json` version is the source of truth (currently **pre-release** `2.0.0-dev.0` until S5/M8).  
`@xray/shared` reads its package version (kept in sync) and exports `XRAY_VERSION`.


## Auth (local)

Worker `wrangler dev --env development` sets:
- `ENVIRONMENT=development`
- `AUTH_DEV_BYPASS=true`
- `ALLOWED_EMAILS=dev@xray.local`

UI proxies `/api/*` to `127.0.0.1:8787`. Session gate calls `GET /api/me`.

## Hosts

| Host | Role |
|------|------|
| `xray.dev.hexly.ai` → :7007 | local UI (Caddy) |
| `xray.hexly.ai` | prod browser + Access |
| `xray-ingest.hexly.ai` | prod push only (no SPA APIs) |
