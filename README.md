# X-Ray

Twitter/X content monitoring — **v2 rewrite** (CF Workers + D1 + Vite).

> Design package: [`docs/`](docs/). Archived vinext app: [`legacy/v1/`](legacy/v1/).

## Local dev

```bash
bun install
bun run dev          # UI :7007 + worker :8787
# or
bun run dev:ui       # Vite SPA (proxies /api → 8787)
bun run dev:worker   # wrangler dev
```

- UI: http://localhost:7007 or https://xray.dev.hexly.ai (Caddy → 7007)
- Worker live: http://127.0.0.1:8787/api/live

## Packages

| Package | Role |
|---------|------|
| `@xray/shared` | types, nav, version |
| `@xray/ui` | Vite React SPA |
| `@xray/worker` | Hono on Cloudflare Workers |

## Version

`package.json` version is the single source of truth (SemVer).
