# X-Ray Project Guidelines

## Overview

X-Ray monitors Twitter users for AI/LLM/Agent tech content and generates reports.

**Pipeline**: fetch (Script) -> classify (Skill/Claude) -> report (Script) -> render (Script)

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **Database**: SQLite (better-sqlite3)
- **API**: TwitterAPI.io
- **Template**: Mustache
- **Testing**: bun:test (149 tests)

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
| `data/classified.json` | Classification results (skill output) |
| `data/output/*_report.json` | Generated reports |
| `public/*_report.html` | Rendered HTML reports |

## Database Schema

```sql
watchlist(username, url, added_at)
tweets(id, text, author_*, metrics, created_at, url, fetched_at)
processed_tweets(tweet_id, processed_at, classification_result)
classifications(tweet_id, is_tech_related, is_hot_topic, category, relevance_score, reason, classified_at)
```

## Commands

```bash
bun test                      # Run all tests
bun run fetch                 # Fetch tweets -> raw_tweets.json
bun run fetch --hours 48      # Fetch past 48 hours
bun run report                # Generate report from classified.json
bun run render                # Render HTML
bun run serve                 # Render and serve (port 7006)
bun run watchlist list        # List watchlist
bun run watchlist add @user   # Add user
```

## Testing

Tests use isolated database: `data/test-x-ray.db`

```typescript
import { useTestDB, useRealDB, resetDB } from "./lib/db";

beforeAll(() => useTestDB());
afterAll(() => useRealDB());
beforeEach(() => resetDB());
```

## Classification Schema

```typescript
interface TweetClassification {
  is_tech_related: boolean;
  is_hot_topic: boolean;
  category: string[];      // ["AI", "Tool", "Insight", ...]
  tags: string[];          // ["#LLM", "#Agent", "#RAG"]
  relevance_score: number; // 0-100
  reason: string;          // Chinese explanation
}
```

## Sensitive Data

- **Never commit**: `config/`, `data/`, `*.db`
- **API keys**: `config/config.json` (gitignored)
- **Test DB**: `data/test-x-ray.db` (gitignored)

## Skills

| Skill | Purpose |
|-------|---------|
| `x-ray-classify` | Classify tweets using Claude |
| `x-ray-manage` | Manage watchlist |
| `x-ray-pipeline` | Run full pipeline |
