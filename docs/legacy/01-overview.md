# Overview

X-Ray is a privacy-first Twitter/X content monitoring dashboard. It provides a full-stack web interface for tracking Twitter accounts, exploring tweets, managing groups, and translating content with AI — all backed by a local SQLite database.

## Core Capabilities

- **Watchlists** — create monitoring lists, auto-fetch member tweets via SSE streaming, AI translate & annotate
- **Groups** — organize Twitter accounts into groups with batch import from Twitter export files
- **Explore** — search tweets, view details/replies, browse user profiles and timelines
- **Personal data** — bookmarks, likes, DMs, analytics dashboard with charts
- **AI translation** — multi-provider support (OpenAI, Anthropic, Google, GLM, DeepSeek, Grok, Ollama)
- **External API** — webhook key auth for third-party consumers
- **Agent scripts** — standalone CLI tools for automated analysis and research (separate from web app)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Framework | vinext (Vite + Next.js RSC) |
| Database | SQLite + Drizzle ORM + ScopedDB (row-level security) |
| Auth | NextAuth v5 + Google OAuth + custom SQLite adapter |
| UI | Tailwind CSS 4 + shadcn/ui |
| AI | Vercel AI SDK (@ai-sdk/anthropic, @ai-sdk/openai) |
| Twitter data | TweAPI.io |
| Testing | Bun test + Playwright |

## Documentation Index

- [`02-architecture.md`](02-architecture.md) — system architecture & data flow
- [`03-run-and-scripts.md`](03-run-and-scripts.md) — running the app & CLI scripts
- [`04-testing.md`](04-testing.md) — 4-layer testing architecture
- [`05-config-and-data.md`](05-config-and-data.md) — configuration & data directories
- [`06-api-tweapi.md`](06-api-tweapi.md) — TweAPI endpoint reference
- [`07-agent-scripts.md`](07-agent-scripts.md) — agent script capabilities
- [`08-deployment.md`](08-deployment.md) — Railway & Docker deployment
- [`09-dashboard-api-roadmap.md`](09-dashboard-api-roadmap.md) — dashboard API integration plan (historical)
- [`10-testing-improvement-plan.md`](10-testing-improvement-plan.md) — testing gap analysis & execution
- [`api.md`](api.md) — external webhook API reference
