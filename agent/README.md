# Potato Agent Scripts for X-Ray

AI-friendly scripts for scheduled tweet fetching and reporting.

## Overview

Scripts are designed for autonomous operation by AI agents, with:
- **Cost control**: Only fetch new tweets since last fetch
- **Caching**: Use SQLite database to track processed tweets
- **Reporting**: Generate daily summaries for the user

## Architecture

```
agent/
├── fetch/                  # Fetch scripts
│   ├── single.ts          # Fetch one user's tweets
│   ├── incremental.ts     # Fetch new tweets since last run (RECOMMENDED)
│   └── full.ts            # Full backfill (use sparingly)
├── analyze/               # Analysis scripts
│   ├── recent.ts          # Analyze recent tweets
│   └── daily.ts           # Generate daily report
├── report/                # Report generation
│   ├── summary.ts         # Quick summary
│   └── markdown.ts        # Markdown report
├── scheduler/             # Scheduling
│   └── hourly.ts          # Hourly fetch schedule
└── index.ts              # Main entry point
```

## Usage

### Recommended: Incremental Fetch

```bash
# Fetch only new tweets since last run
bun run agent/fetch/incremental.ts

# Fetch specific user
bun run agent/fetch/single.ts --user karpathy

# Analyze and report
bun run agent/analyze/recent.ts --hours 4

# Full workflow: fetch + analyze + report
bun run agent/index.ts --mode hourly
```

## Database Schema

### Tables Used

| Table | Purpose |
|-------|---------|
| `tweets` | Store all fetched tweets |
| `processed_tweets` | Track which tweets have been analyzed |
| `classifications` | AI analysis results |
| `watchlist` | Users to monitor |

### Cost Control

1. **Incremental fetch only**: Use `fetched_at` timestamp to only fetch new tweets
2. **Rate limiting**: Process users in batches with delay
3. **Time window**: Default 4 hours, configurable

### Caching Strategy

```typescript
// Check if tweet already processed
const processed = processedGet(tweetId);
if (processed) {
  skip;  // Already fetched and analyzed
}

// Mark as processed after analysis
processedMark(tweetId, "selected" | "skipped");
```

## API Functions (for AI)

### fetchUser(username, options?)

```typescript
import { fetchUser } from "./agent/fetch/single";

const tweets = await fetchUser("karpathy", {
  hoursBack: 4,  // Default
  skipProcessed: true  // Default
});
```

### fetchWatchlist(options?)

```typescript
import { fetchWatchlist } from "./agent/fetch/incremental";

const result = await fetchWatchlist({
  hoursBack: 4,
  skipProcessed: true,
  batchSize: 10  // Process 10 users per batch
});
```

### getUnprocessedTweets(options?)

```typescript
import { getUnprocessedTweets } from "./agent/analyze/recent";

const tweets = await getUnprocessedTweets({
  limit: 50,
  hoursBack: 24
});
```

## Scheduling

### Hourly Job (Recommended)

```bash
# Run every hour at :05 past
clawdbot cron add --at "5 * * * *" --session agent:main:slack:channel:xxx "bun run ~/workspace/moltbot/xray/agent/index.ts --mode hourly"
```

### Manual Run

```bash
# Fetch + Analyze + Report
bun run agent/index.ts --mode hourly

# Fetch only
bun run agent/fetch/incremental.ts

# Analyze only
bun run agent/analyze/recent.ts --hours 4
```

## Output

### Console Output

```
[potato] Fetching 51 users...
[potato]   @karpathy: 3 new tweets
[potato]   @sama: 0 new tweets
[potato] Total: 15 new tweets
[potato] Analyzing...
[potato]   Selected 5 tweets (tech-related)
[potato] Report generated: reports/potato_20260130_0700.md
```

### Report Format

Reports are saved to:
- `reports/potato_YYYYMMDD_HHMM.md`
- Sent to Slack/Obsidian

## Configuration

No extra config needed. Uses existing:
- `config/config.json` for API keys
- SQLite database for caching

## Next Steps

1. [ ] Implement `single.ts` (single user fetch)
2. [ ] Implement `incremental.ts` (smart fetch)
3. [ ] Implement `recent.ts` (get unprocessed)
4. [ ] Implement `hourly.ts` (scheduler)
5. [ ] Test with real API
6. [ ] Set up cron job
