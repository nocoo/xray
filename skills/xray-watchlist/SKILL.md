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

Fetches the last 1 hour of tweets from all users in watchlist, automatically:
- Filters out pure retweets (configurable)
- Skips already processed tweets
- Saves to database and `data/raw_tweets.json`

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
2. **Identify Threads**: Group author self-replies as single units
3. **Select Top 20**: Pick the most valuable tweets/threads
4. **Generate Report**: Create magazine-style Markdown report
5. **Append Full Index**: At the end, list *all* tweets, grouped by category, with full text
6. **Save Report**: Write to `reports/` with timestamp

### 3. Sync to Obsidian (REQUIRED)

**⚠️ CRITICAL: This step is MANDATORY. Do NOT skip.**

```bash
bun run scripts/sync-report.ts
```

This copies the report to Obsidian vault. Must run after saving report.

## Thread Identification

Same-author consecutive replies should be treated as one Thread:

```
Main tweet "Just shipped a new feature..."
  └── Reply "Here's how it works..."
        └── Reply "And the GitHub repo..."
```

**Detection**: Check `reply_to_id` field, trace up to find root tweet by same author.

**Thread Priority**: Threads indicate deeper content, prioritize them in selection.

## Selection Criteria

Use your judgment to pick valuable content:

1. **Information Value** - Substantial content, not fluff
2. **Uniqueness** - New perspectives, resources, insights
3. **Timeliness** - Breaking news, fresh releases
4. **Thread Bonus** - Multi-reply threads = deeper discussion

**Worth selecting:**
- Hot events (product launches, major news, industry updates)
- Deep insights or contrarian views
- Practical resources (tools, tutorials, open source)
- Interesting discussions or debates

**Not limited to tech** - anything valuable is fair game.

## Exclusions

- Pure retweets without comment
- Ads / promotional content
- Low-value small talk
- Duplicate content (pick the most representative)
- Child replies already merged into Thread (only select root)

## Report Format (CRITICAL)

Generate a **magazine/newsletter style** Markdown report in **Simplified Chinese**.

### Structure:

```markdown
# X 洞察 | YYYY-MM-DD

---

## 🔥 今日热点

### 1. [Tweet Title / Summary](https://x.com/...)

**作者**: @username | **时间**: X小时前 | **互动**: X likes, X retweets

一句话点明核心价值或新闻点。

**深度解读**:
- 💡 关键洞察1
- 🔥 关键洞察2
- 📈 趋势/启发

---

### 2. [Next Tweet]...

...

## 📝 总结

今日X动态呈现以下趋势:
1. ...
2. ...

**关注重点**: ...

---

## 📚 全量推文清单

按主题分类列出 *全部* 推文，写出全文内容（不省略），并保留原推文链接。

---

*本报告基于 X-Ray watchlist 自动生成*
*生成时间: YYYY-MM-DD HH:MM UTC+8*
```

### Format Rules:

1. **Title**: MUST be a Markdown link to original tweet URL
   - ✅ `### 1. [Claude 发布新功能](https://x.com/...)`
   - ❌ `### 1. Claude 发布新功能`

2. **Metadata Line**: Author, Time (relative), Engagement metrics

3. **1-Liner Summary**: Punchy "so what?" summary

4. **Deep Interpretation**: 2-3 bullets explaining WHY this matters
   - For Threads, mention "(N条连续推文)" in summary

5. **Language**: Simplified Chinese, even for English tweets. For non-Chinese tweets, provide full Chinese translation.

6. **Categories**: Group by theme if appropriate (AI, Tools, Industry, etc.)
7. **Full Index**: At the end, list *all* tweets with full text, grouped by category.

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
