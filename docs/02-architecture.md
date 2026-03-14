# Architecture

## Overview

X-Ray is a full-stack web application for Twitter/X content monitoring. The architecture follows a layered design:

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│  vinext (Vite + RSC) · Tailwind · shadcn/ui │
├─────────────────────────────────────────────┤
│              API Routes Layer                │
│  Session Auth (OAuth)  ·  Webhook Key Auth   │
├─────────────────────────────────────────────┤
│              ScopedDB Layer                  │
│  Row-level security · Per-user isolation     │
├─────────────────────────────────────────────┤
│              Data Layer                      │
│  SQLite · Drizzle ORM · Bun/better-sqlite3  │
├─────────────────────────────────────────────┤
│           External Services                  │
│  TweAPI (Twitter data) · AI SDK (translate)  │
└─────────────────────────────────────────────┘
```

## Key Components

### Frontend (src/app/, src/components/)

- **vinext** — Vite-based Next.js RSC implementation, NOT standard Next.js
- **App Router** — `(dashboard)/` route group with shared AppShell layout
- **ViewModel hooks** — `useFetch`, `useSearch` in `src/hooks/use-api.ts`
- **23 dashboard pages** — watchlists, groups, tweets, users, bookmarks, likes, lists, messages, analytics, usage, webhooks, settings, ai-settings, integrations

### Auth (src/auth.ts, src/lib/auth-adapter.ts)

- **NextAuth v5** with Google OAuth provider
- **JWT strategy** — `session: { strategy: "jwt" }` (explicit, required when adapter is present)
- **Custom SQLite adapter** — resolves identity via `account` table JOIN on `(provider, providerAccountId)`, giving stable user IDs across browsers
- **Middleware** in `src/proxy.ts` — validates session + proxies API requests

### Database (src/db/)

- **SQLite** with runtime detection: `bun:sqlite` in Bun, `better-sqlite3` in Node.js
- **Drizzle ORM** for schema definition and migrations
- **16 tables**: 4 auth (`user`, `account`, `session`, `verificationToken`) + 12 business (`watchlists`, `watchlist_members`, `fetched_posts`, `fetch_logs`, `tags`, `watchlist_member_tags`, `groups`, `group_members`, `twitter_profiles`, `api_credentials`, `webhooks`, `usage_stats`, `settings`)
- **ScopedDB** (`src/db/scoped.ts`) — binds `userId` at construction time, auto-injects `WHERE user_id = ?` on every query. "Correct by construction" row-level security.

### API Routes (src/app/api/)

Two authentication modes:

| Auth Mode | Header | Use Case |
|-----------|--------|----------|
| Session | Cookie (NextAuth JWT) | Dashboard UI, all `/api/explore/*`, `/api/watchlists/*`, etc. |
| Webhook | `X-Webhook-Key` | External consumers via `/api/twitter/*`, `/api/me/*` |

62+ route handlers across 16 top-level directories.

### Twitter Provider Layer (src/lib/twitter/)

- **ITwitterProvider** interface — abstracts all TweAPI endpoints
- **TweAPIProvider** — production implementation against `api.tweapi.io`
- **MockProvider** — testing stub
- **Normalizer** — converts raw TweAPI responses to internal `Tweet`/`UserInfo` types

### Services (src/services/)

- **AI translation** — supports multiple providers (OpenAI, Anthropic, Google, GLM, DeepSeek, Grok, Ollama) via Vercel AI SDK
- **Translation style** — "信达雅" Chinese translation + editorial commentary

### Agent System (agent/)

Standalone CLI scripts for automated analysis (separate from the web app):

- `agent/fetch/` — tweet fetching (single user, incremental)
- `agent/analyze/` — AI-powered tweet analysis
- `agent/research/` — 12 research scripts (competitor watch, influencer finder, viral analyzer, etc.)
- `agent/workflow/` — scheduled workflows (hourly)

## Data Flow: Watchlist Fetch

```
User clicks "Fetch" → POST /api/watchlists/[id]/fetch
  → SSE stream opened
  → For each member:
      → TweAPIProvider.getUserTweets()
      → ScopedDB.saveFetchedPosts()
      → If auto-translate enabled:
          → AI SDK translate each tweet
          → ScopedDB.updateTranslation()
      → SSE event: { member, status, count }
  → SSE complete
```

## Environment

- **Runtime**: Bun (production + tests), Node.js (next dev workers)
- **Build**: `vinext build` → `dist/`
- **Deploy**: Docker multi-stage build → Railway with SQLite volume at `/data`
- **Data persistence**: `XRAY_DATA_DIR` env var controls SQLite location
