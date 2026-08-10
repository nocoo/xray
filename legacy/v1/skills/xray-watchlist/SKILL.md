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
  "tweets": [...]
}
```

Analyze output at `data/analyze_output.json` (STRICT JSON only):
```json
{
  "generated_at": "2026-01-26T10:05:00.000Z",
  "items": [
    {
      "id": "tweet_id",
      "translation": "中文译文（仅英文）",
      "score": 86,
      "evaluation": "1-2句中文评价"
    }
  ]
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

Or run the guided flow:

```bash
bun run scripts/run-watchlist-report.ts
```

### 2. Analyze (AI Step)

After fetching, you (Claude) will:

1. **Read** `data/raw_tweets.json`
2. **Analyze**: For each tweet, output translation (English only), score (0-100 integer), evaluation (1-2 Chinese sentences)
3. **Write** `data/analyze_output.json` in strict JSON format
4. **Run** `bun run scripts/validate-analyze-output.ts`

### 3. Generate Report

```bash
bun run scripts/generate-watchlist-report.ts
```

This reads `data/raw_tweets.json` + `data/analyze_output.json` and generates a fixed-format report in `reports/`.

### 4. Sync to Obsidian (REQUIRED)

**⚠️ CRITICAL: This step is MANDATORY. Do NOT skip.**

```bash
bun run scripts/sync-report.ts
```

This copies the report to Obsidian vault. Must run after saving report.

## Scoring Guidelines

Score each tweet on a 0-100 scale based on content and engagement.
Include a 1-2 sentence evaluation in Chinese.

## Report Format (CRITICAL)

Generate a **Markdown** report in **Simplified Chinese**.

### Structure:

```markdown
# X-Ray Watchlist Report
Generated: YYYY-MM-DD HH:MM
Total tweets: N


## N. @user
<translation if English>
<full text>
<url>
- Engagement: likes X | reposts Y | replies Z | quotes Q | views V
- Score: 0-100
- Evaluation: 1-2句中文评价
```

### Format Rules:

1. **Translation line** only for English tweets
2. **Ordering**: Sort by score descending

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
| `bun run scripts/run-watchlist-report.ts` | Guided watchlist flow |
| `bun run scripts/validate-analyze-output.ts` | Validate analyze output |
| `bun run scripts/generate-watchlist-report.ts` | Generate watchlist report |
| `bun run scripts/sync-report.ts` | Sync latest report to Obsidian |
| `bun run scripts/manage-watchlist.ts list` | List watched users |
| `bun run scripts/manage-watchlist.ts add @user` | Add user |
| `bun run scripts/manage-watchlist.ts remove @user` | Remove user |

## Data Files

| File | Description |
|------|-------------|
| `data/raw_tweets.json` | Fetched tweets (input for AI) |
| `data/analyze_output.json` | Analyze output (AI) |
| `reports/*.md` | Generated Markdown reports |
| `data/x-ray.db` | SQLite database (watchlist, tweets) |
| `config/config.json` | API keys (never commit) |
