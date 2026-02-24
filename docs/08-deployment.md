# Deployment

X-Ray runs on [Railway](https://railway.com) as a Docker container with a persistent SQLite volume.

## Architecture

```
Railway (asia-southeast1)
├── Service: xray
│   ├── Builder: DOCKERFILE
│   ├── Source: GitHub (nocoo/xray, main branch)
│   ├── Domain: xray.hexly.ai (port 7027)
│   └── Volume: /data (SQLite persistence)
```

## Dockerfile

Three-stage build using `oven/bun:1`:

1. **deps** — `bun install --frozen-lockfile`
2. **builder** — `bun run build` (Next.js standalone output)
3. **runner** — Copy standalone output, static files, public assets; start with `bun server.js`

Key environment variables set in Dockerfile:

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `7027` | Next.js server port |
| `HOSTNAME` | `0.0.0.0` | Bind to all interfaces (required for Railway reverse proxy) |

## Railway Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXTAUTH_URL` | `https://xray.hexly.ai` |
| `ALLOWED_EMAILS` | Comma-separated email allowlist |
| `PORT` | `7027` |
| `USE_SECURE_COOKIES` | `true` (HTTPS) |
| `XRAY_DATA_DIR` | `/data` (volume mount for SQLite) |

## Volume Mount

SQLite database is stored on a Railway volume mounted at `/data`. The `XRAY_DATA_DIR=/data` environment variable tells the app to write `xray.db` there instead of the default `database/` directory. This ensures data survives redeployments.

## Health Check

```
GET /api/live
→ {"status":"ok","version":"0.2.0","checks":{"database":"ok"}}
```

## Gotchas

### 1. DOCKERFILE builder executes startCommand in exec mode

Railway's custom `startCommand` behaves differently depending on the builder:

- **RAILPACK**: runs in a shell — `PORT=7027 bun server.js` works (shell interprets `PORT=7027` as env prefix)
- **DOCKERFILE**: runs in exec mode — `PORT=7027 bun server.js` fails because `PORT=7027` is parsed as the executable name

**Fix**: Do NOT set a custom `startCommand` when using DOCKERFILE builder. Rely on the Dockerfile's `CMD` and `ENV` directives instead.

### 2. Next.js standalone requires HOSTNAME=0.0.0.0

Without `ENV HOSTNAME=0.0.0.0` in the Dockerfile, Next.js standalone `server.js` binds to the container's internal hostname (e.g., `6783221ac502`). Railway's reverse proxy cannot reach it.

**Fix**: Always set `ENV HOSTNAME=0.0.0.0` in the Dockerfile.

### 3. Railway ignores EXPOSE

Railway does not use Dockerfile's `EXPOSE` directive. Port routing is configured via:
- The `PORT` environment variable
- Custom domain `targetPort` setting in Railway dashboard

## Local Docker Testing

```bash
docker build -t xray .
docker run -p 7027:7027 \
  -v $(pwd)/data:/data \
  -e XRAY_DATA_DIR=/data \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  -e NEXTAUTH_SECRET=... \
  -e ALLOWED_EMAILS=... \
  xray
```
