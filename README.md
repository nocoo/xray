# X-Ray

Twitter tech content monitoring system. Fetches tweets from a watchlist, classifies them using Claude, and generates HTML reports.

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   fetch     │ -> │  classify   │ -> │   report    │ -> │   render    │
│  (Script)   │    │  (Skill)    │    │  (Script)   │    │  (Script)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       v                  v                  v                  v
 raw_tweets.json   classified.json    *_report.json    *_report.html
```

## Quick Start

```bash
# Install dependencies
bun install

# Configure API key
cp config/config.example.json config/config.json
# Edit config/config.json with your TwitterAPI.io key

# Add users to watchlist
bun run watchlist add @username

# Fetch tweets
bun run fetch

# Classify (via Skill) -> generates classified.json

# Generate report
bun run report

# Render and serve
bun run serve
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
│   ├── generate-report.ts
│   ├── manage-watchlist.ts
│   └── render-report.ts
├── skills/            # Claude Skills
│   ├── x-ray-classify/
│   ├── x-ray-manage/
│   └── x-ray-pipeline/
├── templates/
│   └── report.html    # Mustache template
├── tests/             # Unit tests
├── config/            # API keys (gitignored)
├── data/              # Runtime data (gitignored)
└── public/            # Generated HTML reports
```

## Commands

| Command | Description |
|---------|-------------|
| `bun test` | Run all tests (149 tests) |
| `bun run fetch` | Fetch tweets from watchlist |
| `bun run fetch --hours 48` | Fetch tweets from past 48 hours |
| `bun run report` | Generate report from classified.json |
| `bun run render` | Render HTML report |
| `bun run serve` | Render and start server (port 7006) |
| `bun run watchlist` | Manage watchlist |
| `bun run watchlist add @user` | Add user to watchlist |
| `bun run watchlist remove @user` | Remove user from watchlist |
| `bun run watchlist list` | List all users |

## Data Flow

1. **Fetch**: `fetch-tweets.ts` calls TwitterAPI.io, saves to `data/raw_tweets.json`
2. **Classify**: Skill reads raw_tweets.json, calls Claude for classification, saves to `data/classified.json`
3. **Report**: `generate-report.ts` merges tweets + classifications, saves to `data/output/*_report.json`
4. **Render**: `render-report.ts` renders HTML using Mustache template, saves to `public/*_report.html`

## Configuration

`config/config.json`:

```json
{
  "api": {
    "api_key": "your-twitterapi-key",
    "base_url": "https://api.twitterapi.io"
  },
  "settings": {
    "time_range_hours": 24,
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
- **Database**: SQLite (better-sqlite3)
- **API**: TwitterAPI.io
- **Template**: Mustache
- **Testing**: bun:test

## License

MIT
