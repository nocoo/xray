<p align="center">
  <img src="../assets/brand/icon-rounded.png" alt="Xray" width="128" height="128" />
</p>

<h1 align="center">Xray</h1>

<p align="center">Collect and read X / Twitter posts and custom-source content by watchlist.</p>

<p align="center">
  <a href="https://xray.hexly.ai">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Xray is a content monitoring and reading tool. Organize accounts into watchlists, send content from a local collector or another producer, then read, translate, and save links from a shared timeline.

The current app runs on Cloudflare Workers and D1, with Cloudflare Access protecting the browser host. Content arrives through a separate ingest host; the Worker does not periodically fetch X. The repository includes a local collector built around `twitter-cli`. Custom sources need their own producer that follows the ingest protocol.

## Features

- Create watchlists, add member tags and notes, and browse paginated timelines filtered by `x.com`, `custom`, or all sources.
- Reuse account collections through Groups, import Twitter export text containing usernames, and copy members into watchlists.
- Use Push tokens to read watchlist membership and submit content, deduplicate by source ID, and inspect accepted, duplicate, and rejected items.
- View watchlist, member, recent-content, and ingest information on the dashboard; adjust the accepted content time window.
- Configure an OpenAI Chat Completions-compatible service for individual or batch translation; add a summary prompt to generate summaries as well.
- Configure a zhe.to webhook to save timeline links into a chosen folder.

## Usage

1. Open the [website](https://xray.hexly.ai) and sign in through Cloudflare Access with an allowed account.
2. Create a watchlist and add members, or organize accounts in Groups and copy them over.
3. Create a token in Settings → Push tokens and supply it to your producer. The full token is shown only when created.
4. Read the resulting timeline. Configure AI Settings for translation and Integrations → zhe.to for saving links.

The local X collector requires macOS / Linux, Bun, Python 3 for `fcntl` process locking, an installed and authenticated `twitter-cli`, and an Xray Push token. Follow the [local producer guide](09-local-producer-twitter-cli.md), then run from the repository root:

```bash
bun run build:shared
bun run refresh:watchlists -- --help
bun run refresh:watchlists -- --dry-run
bun run refresh:watchlists --
```

`--dry-run` still reads membership from the ingest service, but does not contact X or push content. A full run spreads account requests over 60 minutes by default. Results depend on login state, upstream rate limits, and available timeline data. Custom producers use `GET /api/v1/ingest/graph` and `POST /api/v1/ingest/push`; see the [data model and ingest protocol](03-data-model-and-ingest.md).

## Development

The project uses Bun workspaces, with Bun 1.3.14 specified in `packageManager`. Install Bun, then run:

```bash
git clone https://github.com/nocoo/xray.git
cd xray
bun install --frozen-lockfile
bun run dev
```

`bun run dev` applies local D1 migrations, builds the shared package, and starts Vite and the Worker:

| Endpoint | Address |
| --- | --- |
| Local UI | `http://localhost:7007` |
| Local Worker | `http://127.0.0.1:37007` |
| Liveness check | `http://127.0.0.1:37007/api/live` |

The local environment uses the `dev@xray.local` identity without Access configuration. Vite hot reload is configured for `https://xray.dev.hexly.ai`; set up Caddy as described in the [architecture guide](02-architecture.md) to use that development hostname and hot reload.

Before saving an AI key or zhe.to webhook, set `XRAY_SECRETS_KEK` in `packages/worker/.dev.vars`: a 32-byte ASCII string, or Base64 that decodes to 32 bytes. See [.env.example](../.env.example) for optional settings. Basic list operations do not require integration secrets.

```bash
bun run build       # shared, UI, and Worker deployment dry-run build
bun run typecheck
bun run lint
```

A self-hosted deployment needs your own D1 database, browser and ingest domains, Access configuration, and server secrets. Update [wrangler.toml](../packages/worker/wrangler.toml) before following the architecture guide. The checked-in configuration references the maintainer's production resources.

```text
packages/ui/        React pages, components, and viewmodels
packages/worker/    Hono API, D1 repositories, and migrations
packages/shared/    Content protocol, collector adapters, and shared types
scripts/           Local collection and data migration tools
e2e/               Browser end-to-end tests
legacy/v1/         Previous vinext application
```

## Tests

Install dependencies and run `bun run build:shared`, then execute these commands from the repository root:

| Test layer | Command |
| --- | --- |
| Shared logic, UI, and Worker unit tests | `bun run test` |
| Worker HTTP integration tests | `bun run --filter @xray/worker test:e2e` |
| Browser end-to-end tests | `bun run test:l3` |

HTTP tests start a local Worker with a separate test D1 database. Unset `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CF_API_TOKEN` before running them. For browser tests, run `bunx playwright install chromium` and keep `bun run dev` running in another terminal. Browser tests create data in the local development database.

## Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflareworkers&logoColor=white)
![D1](https://img.shields.io/badge/D1-F38020?logo=cloudflare&logoColor=white)

| Area | Implementation |
| --- | --- |
| Web UI | React, Vite, React Router, Tailwind CSS, Recharts |
| API and data | Hono, Cloudflare Workers, D1; Cloudflare Access authentication |
| Collection | Bun / TypeScript scripts, twitter-cli adapter, Python process lock |
| Development and testing | Bun workspaces, Turborepo, Biome, Vitest, Playwright |

## Documentation

- [Documentation index](README.md)
- [Architecture and environment configuration](02-architecture.md)
- [Data model and ingest protocol](03-data-model-and-ingest.md)
- [Feature reference](04-features.md)
- [Local collection producer](09-local-producer-twitter-cli.md)
- [Collection scheduling](10-refresh-schedule.md)
- [Changelog](../CHANGELOG.md)

## License

The repository does not currently include a LICENSE file.
