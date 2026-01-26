# X-Ray

Twitter tech content monitoring system. Fetches tweets from a watchlist and generates insightful Markdown reports using AI.

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   fetch     │ -> │   Claude    │ -> │   report    │
│  (Script)   │    │  (AI/Skill) │    │  (Markdown) │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       v                  v                  v
 raw_tweets.json    AI Analysis      reports/*.md
```

## Quick Start

```bash
# Install dependencies
bun install

# Configure API key
cp config/config.example.json config/config.json
# Edit config/config.json with your TweAPI.io key

# Add users to watchlist
bun run watchlist add @username

# Run the pipeline (via xray-insights skill)
# 1. Fetch tweets
bun run fetch

# 2. Use Claude to analyze and generate report
# (This step is performed by the xray-insights skill)
```

## Project Structure

```
x-ray/
├── scripts/           # CLI scripts
│   ├── lib/           # Shared libraries
│   │   ├── api.ts     # Twitter API client
│   │   ├── db.ts      # SQLite database
│   │   ├── tweet-db.ts
│   │   ├── tweet-utils.ts
│   │   ├── types.ts   # TypeScript interfaces
│   │   ├── utils.ts
│   │   └── watchlist-db.ts
│   ├── fetch-tweets.ts
│   └── manage-watchlist.ts
├── skills/            # Claude Skills
│   └── xray-insights/ # Main skill for fetching and reporting
├── reports/           # Generated Markdown reports
├── tests/             # Unit tests
├── config/            # API keys (gitignored)
└── data/              # Runtime data (gitignored)
```

## Commands

| Command | Description |
|---------|-------------|
| `bun test` | Run all tests (154 tests) |
| `bun run fetch` | Fetch tweets from watchlist |
| `bun run watchlist` | Manage watchlist |
| `bun run watchlist add @user` | Add user to watchlist |
| `bun run watchlist remove @user` | Remove user from watchlist |
| `bun run watchlist list` | List all users |

## Data Flow

1. **Fetch**: `fetch-tweets.ts` calls TweAPI.io, saves to `data/raw_tweets.json`
2. **Analyze**: Claude reads raw_tweets.json, identifies valuable content
3. **Report**: Claude generates magazine-style Markdown report
4. **Save**: Report saved to `reports/` and synced to Obsidian

## Configuration

`config/config.json`:

```json
{
  "api": {
    "api_key": "your-tweapi-key",
    "base_url": "https://api.tweapi.io"
  },
  "settings": {
    "max_tweets_per_user": 100
  },
  "classification": {
    "interests": ["AI", "LLM", "Agent", "RAG"],
    "filter_retweets_without_comment": true
  }
}
```

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite (bun:sqlite)
- **API**: TweAPI.io
- **Testing**: bun:test

## License

MIT
