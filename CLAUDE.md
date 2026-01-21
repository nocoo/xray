# Project Guidelines for Claude AI

## Overview

X-Ray monitors Twitter users for AI/LLM/Agent tech content and generates reports.

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **Database**: SQLite
- **API**: TwitterAPI.io
- **Testing**: bun:test

## Coding Conventions

- **Language**: Code in English; comments and docs in Chinese when communicating with user
- **Style**: No comments in code unless requested; concise, direct responses
- **Imports**: Use absolute paths (e.g., `../scripts/lib/db`)

## Key Files

| File | Purpose |
|------|---------|
| `scripts/lib/db.ts` | Database connection, test/prod mode切换 |
| `scripts/lib/tweet-db.ts` | Tweet CRUD operations |
| `scripts/lib/types.ts` | TypeScript interfaces |
| `scripts/lib/api.ts` | Twitter API client |
| `config/config.json` | API keys (never commit) |

## Database Schema

```
watchlist(username, url, added_at)
tweets(id, text, author_*, metrics, created_at, url, fetched_at)
processed_tweets(tweet_id, processed_at, classification_result)
classifications(tweet_id, is_tech_related, is_hot_topic, category, relevance_score, reason, classified_at)
```

## Testing

- Tests use isolated test database: `data/test-x-ray.db`
- Use `useTestDB()` and `useRealDB()` for mode切换
- Run `bun test` to verify changes

```typescript
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
```

## Commands

```bash
bun test          # Run tests
bun run fetch     # Fetch tweets
bun run report    # Generate report
bun run render    # Render HTML
bun run serve     # Serve locally
```

## Sensitive Data

- **Never commit**: `config/`, `data/`, `*.db`
- **API keys**: Stored in `config/config.json` (gitignored)
- **Test DB**: `data/test-x-ray.db` (gitignored)

## User Preferences

- Use simplified Chinese when communicating
- Use emoji sparingly, only when requested
- Be factual and objective; don't blindly agree with user's opinions
- Ask clarifying questions when uncertain

## Recent Changes

- Added test database isolation for unit tests
- 93 tests passing covering all DB operations
