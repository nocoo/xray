# X-Ray

Twitter/X content monitoring — **v2 rewrite** (CF Workers + D1 + Vite).

> Design package: [`docs/`](docs/). Archived vinext app: [`legacy/v1/`](legacy/v1/).  
> Progress: [`docs/07-implementation-plan.md`](docs/07-implementation-plan.md).

## Local dev

```bash
bun install
bun run db:migrate:local   # apply D1 migrations to local state
bun run dev                # migrate + shared build + UI :7007 + worker :37007
# or
bun run dev:ui       # Vite SPA (proxies /api → 37007)
bun run dev:worker   # wrangler dev --env development
```

- UI: http://localhost:7007 or https://xray.dev.hexly.ai (Caddy → 7007)
- Worker live: http://127.0.0.1:37007/api/live

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

Root `package.json` version is the source of truth.  
`@xray/shared` exports `XRAY_VERSION` (kept in sync with workspace packages).

```bash
bun run release              # Z+1 patch
bun run release -- minor     # Y+1 minor
bun run release -- major     # X+1 major
bun run release -- --dry-run # preview
```

After release: CI on push; deploy Worker with `bun run deploy` when CD is not automatic.

See [CHANGELOG.md](CHANGELOG.md) and GitHub Releases for what’s new.


## Auth (local)

`bun run dev` / `dev:worker` run `db:migrate:local` first so `users` exists.

Worker `wrangler dev --env development` sets:
- `ENVIRONMENT=development`
- `AUTH_DEV_BYPASS=true`
- `ALLOWED_EMAILS=dev@xray.local`

UI proxies `/api/*` to `127.0.0.1:37007`. Session gate calls `GET /api/me`.

## Hosts

| Host | Role |
|------|------|
| `xray.dev.hexly.ai` → :7007 | local UI (Caddy) |
| `xray.hexly.ai` | prod browser + Access |
| `xray-ingest.hexly.ai` | prod agent host: graph + push (no SPA) |
