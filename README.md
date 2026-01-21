# X-Ray: Twitter Tech Content Monitoring System

Monitor specific Twitter users and filter for AI/LLM/Agent hot topics.

## Architecture

```
fetch-tweets.ts → SQLite DB → AI Classification → classified.json → generate-report.ts → HTML Report
```

## Quick Start

```bash
# Install dependencies
bun install

# Run tests
bun test

# Fetch tweets from watchlist
bun run fetch

# Generate report
bun run report

# Serve report in browser
bun run serve

# Manage watchlist
bun run watchlist list
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run fetch` | Fetch recent tweets from all watchlist users |
| `bun run report` | Generate JSON report from classified tweets |
| `bun run render` | Render HTML report and optionally serve |
| `bun run serve` | Start local server for HTML report |
| `bun run watchlist add <username>` | Add user to watchlist |
| `bun run watchlist list` | List all users in watchlist |
| `bun run watchlist remove <username>` | Remove user from watchlist |
| `bun test` | Run unit tests |

## Project Structure

```
x-ray/
├── scripts/           # Main scripts
│   ├── fetch-tweets.ts      # Fetch tweets from API
│   ├── generate-report.ts   # Generate JSON report
│   ├── render-report.ts     # Render HTML report
│   └── manage-watchlist.ts  # Manage watchlist
├── tests/             # Unit tests
├── templates/         # HTML templates
├── public/            # Static files (reports)
├── config/            # Configuration (API keys - gitignored)
└── data/              # Database and data files (gitignored)
```

## Configuration

Create `config/config.json`:

```json
{
  "api": {
    "api_key": "your-api-key",
    "base_url": "https://api.twitterapi.io"
  },
  "settings": {
    "time_range_hours": 24,
    "max_tweets_per_user": 50
  },
  "classification": {
    "interests": ["AI", "LLM", "Agent"],
    "filter_retweets_without_comment": true
  }
}
```

## Data Flow

1. **Fetch**: `fetch-tweets.ts` queries Twitter API for each watchlist user
2. **Store**: Tweets saved to SQLite DB (`data/x-ray.db`)
3. **Classify**: AI analyzes tweets for tech relevance and hot topics
4. **Report**: Filtered tweets compiled into HTML report

## Dependencies

- [Bun](https://bun.sh) - Runtime
- [TwitterAPI.io](https://twitterapi.io) - Twitter API provider
- SQLite - Local database

## License

MIT
