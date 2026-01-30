---
name: xray-watchlist
description: "Twitter/X watchlist monitoring skill. Fetches tweets from followed users, filters valuable content using AI, and generates magazine-style Markdown reports. Use for 'tech insights', 'AI trends', 'what's new on X', or 'Twitter briefing'."
---

# X-Ray Watchlist

Fetch tweets from your watchlist and generate insightful reports.

## Tools

### fetch-tweets.ts

**Usage:**

```bash
bun run scripts/fetch-tweets.ts
```

Fetches recent tweets from all users in watchlist, automatically:
- Filters out pure retweets (configurable)
- Saves to `data/raw_tweets.json`

**Arguments:**
- `--include-processed`: Include already processed tweets (default: skip)

**Output:**
JSON file at `data/raw_tweets.json` containing:
```json
{
  "fetched_at": "2026-01-26T10:00:00.000Z",
  "time_range": { "from": "...", "to": "..." },
  "tweets": [...]
}
```

### manage-watchlist.ts

**Usage:**

```bash
bun run scripts/manage-watchlist.ts list          # List all users
bun run scripts/manage-watchlist.ts add @user     # Add user
bun run scripts/manage-watchlist.ts remove @user  # Remove user
```

## Workflow

When user triggers this skill:

### 1. Fetch Tweets

```bash
bun run scripts/fetch-tweets.ts
```

### 2. AI Analysis & Report Generation

After fetching, you (Claude) will:

1. **Read** `data/raw_tweets.json`
2. **Per-user Cap**: Keep up to 20 most recent tweets per user
3. **Translate**: If tweet text is English, translate to Simplified Chinese
4. **Classify**: Assign a category label (AI, Tools, Industry, etc.)
5. **Score & Evaluate**: Give a quality score based on content value, likes, and reposts; add a short evaluation
6. **Sort**: Sort all tweets by score descending
7. **Generate Report**: Create Slack-compatible Markdown output
8. **Save Report**: Write to `reports/` with timestamp

### 3. Sync to Obsidian (REQUIRED)

**⚠️ CRITICAL: This step is MANDATORY. Do NOT skip.**

```bash
bun run scripts/sync-report.ts
```

This copies the report to Obsidian vault. Must run after saving report.

## Scoring Guidelines

Score each tweet on a 0-100 scale using:

1. **Content Value** (0-50): information depth, originality, usefulness
2. **Engagement** (0-30): likes and reposts
3. **Clarity** (0-20): clear point, actionable takeaway

Include a short evaluation sentence (Chinese) that explains the score.

## Report Format (CRITICAL)

Generate a **Slack-compatible Markdown** report in **Simplified Chinese**.

### Structure:

```markdown
# X 洞察 | YYYY-MM-DD

## 🔥 评分排序清单

1. <https://x.com/...|Tweet Title / Summary>
   作者: @username | 时间: X小时前 | 互动: X likes, X reposts
   分类: AI | 评分: 92/100
   评价: 一句话解释评分理由。
   翻译: 若原文为英文，输出完整中文译文。

2. <https://x.com/...|Next Tweet>
   ...

---

*本报告基于 X-Ray watchlist 自动生成*
*生成时间: YYYY-MM-DD HH:MM UTC+8*
```

### Format Rules:

1. **Title Link**: Use Slack link format `<url|title>`
2. **Metadata Line**: Author, Time (relative), Engagement metrics
3. **Category Line**: Category label and score
4. **Evaluation Line**: Short Chinese evaluation explaining the score
5. **Translation Line**: Only for English tweets, provide full Chinese translation
6. **Ordering**: Sort by score descending

## Output Locations

### 1. Save to Project

```
reports/xray_YYYYMMDD_HHMM.md
```

### 2. Sync to Obsidian

After saving report, run the sync script (this avoids external directory permission prompts):

```bash
bun run scripts/sync-report.ts
```

This script automatically:
- Finds the latest report in `reports/`
- Creates the Obsidian directory if needed
- Copies the report to `/Users/nocoo/workspace/personal/obsidian/xray/`

You can also specify a specific report:
```bash
bun run scripts/sync-report.ts reports/xray_20260126_1430.md
```

## User Intent Examples

- "Run X-Ray"
- "What's new on my Twitter feed?"
- "今天X上有什么新动态？"
- "帮我看看关注的人最近在聊什么"
- "Generate Twitter insights"
- "X洞察"

## Completion Notification

After pipeline completes (success or failure), **MUST** call `task-notifier` skill:

```bash
# On success
python3 /Users/nocoo/workspace/personal/skill-task-notifier/scripts/notify.py "X-Ray 完成：筛选了 {count} 条推文" success

# On failure
python3 /Users/nocoo/workspace/personal/skill-task-notifier/scripts/notify.py "X-Ray 失败：{error}" error
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `bun run scripts/fetch-tweets.ts` | Fetch from watchlist |
| `bun run scripts/sync-report.ts` | Sync latest report to Obsidian |
| `bun run scripts/manage-watchlist.ts list` | List watched users |
| `bun run scripts/manage-watchlist.ts add @user` | Add user |
| `bun run scripts/manage-watchlist.ts remove @user` | Remove user |

## Data Files

| File | Description |
|------|-------------|
| `data/raw_tweets.json` | Fetched tweets (input for AI) |
| `reports/*.md` | Generated Markdown reports |
| `data/x-ray.db` | SQLite database (watchlist, tweets) |
| `config/config.json` | API keys (never commit) |
