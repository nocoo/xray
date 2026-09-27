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
3. Create a channel under Channels, then create named push tokens in its settings to submit Markdown reports. The full token is shown only when created. Watchlist producer tokens remain available through the browser-authenticated API; see the [producer runbook](09-local-producer-twitter-cli.md).
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

`bun run dev` builds the shared package and starts the managed gateway. Open **https://xray.dev.hexly.ai** through Caddy for local preview and HMR. The gateway listens on 7007; native Worker and inspector ports are allocated dynamically.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Resolve launcher mode, valid saved preference, then Demo |
| `bun run dev -- --mode demo` | Explicit persistent Demo session |
| `bun run dev -- --mode e2e` | Fresh manual E2E session; switching remains available |
| `bun run preview -- --mode demo` | Build and serve the same UI from `packages/worker/static` |
| `bun run env:db -- init --mode demo` | Initialize owned Demo storage and fixtures |
| `bun run env:db -- migrate --mode demo` | Apply current migrations to Demo |
| `bun run env:db -- seed --mode demo` | Seed only an unseeded Demo store |
| `bun run env:db -- reset --mode demo` | Explicitly replace Demo data and discard its edits |

Stop the active Demo session before database commands. Demo persists in `packages/worker/.wrangler/environments/demo`; normal restarts retain edits. E2E uses a new owned `e2e-*` directory and cleans it up on shutdown. The retired `.wrangler/state-mock` store is preserved untouched.

The local header shows **Demo | E2E | Prod**. Accepted interactive choices persist as a mode enum; switching checks unsaved drafts and reloads the home page. API requests and reader caches remain bound to the accepted instance, so an old request cannot become a write to another backend. Only automated E2E disables both alternatives until shutdown. Manual E2E can switch back; leaving it cleans up its disposable data. Hosted deployments ignore local preferences; cloud CI also hides the control.

Demo/E2E retain real JWT verification with signed fixture identities, production migrations and normal CRUD. Known external services use native fixture bindings, and the launcher provisions local encryption keys; do not configure daily `.dev.vars` for these sessions. Channel Markdown and related-preview images remain external HTTPS links. See the [environment contract](12-local-environments.md) and [fixture matrix](13-environment-fixtures.md).

Local Prod connects to the deployed API with the real Access identity. Its edits, deletions, translations and integrations can affect production data. Install `cloudflared`, sign in, then explicitly select Prod:

```bash
bun run login:prod
bun run dev -- --mode prod
```

Credentials stay on the local server. Automated tests never select the real Prod service. Both Vite and locally served built assets support the same environment contract; only a trusted launcher injects the bootstrap marker, including automated CI with a hidden control.

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
| Worker HTTP integration + route inventory | `bun run test:l2` |
| Browser end-to-end tests | `bun run test:l3` |

L2 and L3 own their fresh native E2E resources and reject inherited production credentials. Use `bun run test:l2` for HTTP tests plus the endpoint inventory gate. Install Chromium with `bun x --no-install playwright install chromium`; `bun run test:l3` builds the application, starts its own gateway and Worker, supplies signed identities and addresses, and cleans up afterward. Direct unmanaged Playwright invocation is rejected. Do not point tests at daily Demo or Prod.

On 2026-09-27, the full native L2 suite passed 41 tests across six files with cleanup, including concurrency and ownership regressions. The final managed L3 suite passed 25/25 in 2.4 minutes with cleanup. Google Chrome acceptance through the local Caddy address passed persistence, draft guards, switching and the manual E2E lifecycle; six captured product surfaces were reviewed. CI execution, real Prod verification and a complete visual audit remain unverified. See [6DQ](06-testing-6dq.md), [AGENTS.md](../AGENTS.md) and the [current verification record](12-local-environments.md).

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
- [Local environments](12-local-environments.md)
- [Environment fixtures](13-environment-fixtures.md)
- [Changelog](../CHANGELOG.md)

## License

The repository does not currently include a LICENSE file.
