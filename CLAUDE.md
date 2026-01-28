# X-Ray Project Guidelines

## Overview

X-Ray monitors Twitter/X watchlist users and generates insightful Markdown reports.

**Workflow**: fetch (Script) -> AI analysis (Claude) -> Markdown report

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **Database**: SQLite (bun:sqlite)
- **API**: TweAPI.io
- **Testing**: bun:test (180 tests)

## Coding Conventions

- **Language**: Code in English; communicate with user in Chinese
- **Style**: No comments unless requested
- **Imports**: Relative paths from scripts (e.g., `./lib/db`)

## Key Files

| File | Purpose |
|------|---------|
| `scripts/lib/types.ts` | All TypeScript interfaces |
| `scripts/lib/db.ts` | Database connection, test/prod mode |
| `scripts/lib/tweet-db.ts` | Tweet CRUD operations |
| `scripts/lib/tweet-utils.ts` | Tweet filtering & utilities |
| `scripts/lib/api.ts` | Twitter API client |
| `scripts/lib/watchlist-db.ts` | Watchlist operations |
| `config/config.json` | API keys (never commit) |

## Data Files

| File | Description |
|------|-------------|
| `data/raw_tweets.json` | Fetched tweets (fetch output) |
| `reports/*.md` | Generated Markdown reports |

## Database Schema

```sql
watchlist(username, url, added_at)
tweets(id, text, author_*, metrics, created_at, url, fetched_at)
processed_tweets(tweet_id, processed_at, classification_result)
```

## Commands

```bash
bun test                      # Run all tests
bun run fetch                 # Fetch tweets -> raw_tweets.json
bun run watchlist list        # List watchlist
bun run watchlist add @user   # Add user
```

## Testing

**Rules**:
- **Before commit**: Must run `bun test` and ensure all tests pass
- **Unit tests**: Use mock data, no real API calls
- **E2E tests**: Run only when explicitly requested (to save API costs)

Tests use isolated database: `data/test-x-ray.db`

```typescript
import { useTestDB, useRealDB, resetDB } from "./lib/db";

beforeAll(() => useTestDB());
afterAll(() => useRealDB());
beforeEach(() => resetDB());
```

## Sensitive Data

- **Never commit**: `config/`, `data/`, `*.db`
- **API keys**: `config/config.json` (gitignored)
- **Test DB**: `data/test-x-ray.db` (gitignored)

## Skill

| Skill | Purpose |
|-------|---------|
| `xray-watchlist` | Fetch tweets from watchlist, AI analysis, generate Markdown report |
| `xray-me` | Fetch personal analytics, track trends, generate summary |

## Report Output

Reports are saved to:
1. `reports/xray_YYYYMMDD_HHMM.md` (project)
2. `/Users/nocoo/workspace/personal/obsidian/xray/` (Obsidian sync)
