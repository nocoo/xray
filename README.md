# 🔍 X-Ray

Twitter/X monitoring system that fetches tweets and generates insightful Markdown reports using AI.

## ✨ Features

- 📡 **Watchlist Monitoring** - Track tweets from your curated user list
- 📊 **Personal Analytics** - Your account metrics, trends, bookmarks & likes
- 🤖 **AI Analysis** - Claude identifies valuable content and generates insights
- 📝 **Markdown Reports** - Magazine-style reports synced to Obsidian

## 🏗️ Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Fetch     │ -> │   Claude    │ -> │   Report    │
│  (Skill)    │    │  (AI)       │    │  (Markdown) │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       v                  v                  v
 raw_tweets.json    AI Analysis      reports/*.md
```

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Configure API key
cp config/config.example.json config/config.json
# Edit config/config.json with your TweAPI.io key

# Run watchlist skill flow
/xray-watchlist
```

## 📁 Project Structure

```
x-ray/
├── scripts/               # 🛠️ CLI scripts
│   ├── lib/               # Shared libraries
│   │   ├── api.ts         # Twitter API client (TweAPI.io)
│   │   ├── db.ts          # SQLite connection
│   │   ├── analytics-db.ts # Analytics storage
│   │   ├── tweet-db.ts    # Tweet CRUD
│   │   ├── watchlist-db.ts
│   │   └── types.ts       # TypeScript interfaces
│   ├── fetch-tweets.ts    # Watchlist tweet fetcher
│   ├── fetch-me-data.ts   # Personal analytics fetcher
│   ├── sync-report.ts     # Obsidian sync
│   └── manage-watchlist.ts
├── skills/                # 🎯 Claude Skills
│   ├── xray-watchlist/    # Watchlist monitoring & reports
│   └── xray-me/           # Personal analytics & reports
├── tests/                 # ✅ Unit tests (180+)
├── config/                # 🔐 API keys (gitignored)
└── data/                  # 💾 Runtime data (gitignored)
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `bun test` | Run all tests |
| `/xray-watchlist` | Fetch watchlist tweets, AI analysis, generate report |
| `/xray-me` | Fetch personal analytics, generate report |

## 🎯 Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `xray-watchlist` | `/xray-watchlist` | Fetch watchlist tweets, AI analysis, generate report |
| `xray-me` | `/xray-me` | Personal analytics, bookmarks, likes, trends |

## 🔧 Configuration

`config/config.json`:

```json
{
  "api": {
    "api_key": "your-tweapi-key",
    "base_url": "https://api.tweapi.io",
    "cookie": "optional-for-authenticated-endpoints"
  },
  "me": {
    "username": "your-username",
    "is_blue_verified": true
  },
  "settings": {
    "max_tweets_per_user": 100
  }
}
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Database | SQLite (bun:sqlite) |
| API | TweAPI.io |
| Testing | bun:test |
| AI | Claude (via Skills) |

## 📊 Data Flow

```
1. 📡 Fetch    → TweAPI.io → raw_tweets.json / me-data.json
2. 🤖 Analyze  → Claude reads data, identifies valuable content
3. 📝 Report   → Generate magazine-style Markdown
4. 💾 Save     → reports/*.md → Obsidian sync
```

## 📜 License

MIT
