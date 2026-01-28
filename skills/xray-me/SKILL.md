---
name: xray-me
description: "Personal Twitter/X analytics skill. Fetches account analytics, bookmarks, likes, lists and generates comprehensive daily reports. Use for 'my Twitter stats', 'how am I doing on X', or 'analytics report'."
---

# X-Ray Me

Comprehensive personal Twitter/X account analysis and daily reporting.

## Requirements

- **Blue verified account** (Twitter Blue subscription)
- **Cookie** configured in `config/config.json`
- **Username** configured in `config.me.username`

## Tools

### fetch-me-data.ts (Primary)

**Usage:**

```bash
bun run scripts/fetch-me-data.ts
```

Fetches all personal data from Twitter API:
- **Analytics**: Core metrics + 7-day time series
- **Bookmarks**: Recently bookmarked tweets
- **Likes**: Recently liked tweets
- **Lists**: Subscribed lists

Saves to `data/me-data.json` and SQLite database.

### fetch-analytics.ts (Legacy)

```bash
bun run scripts/fetch-analytics.ts
```

Fetches only analytics data (subset of fetch-me-data).

## Workflow

When user triggers this skill:

### 1. Fetch All Data

```bash
bun run scripts/fetch-me-data.ts
```

### 2. Read Data

```bash
cat data/me-data.json
```

### 3. Generate Report

After fetching, you (Claude) will:

1. **Read** `data/me-data.json`
2. **Analyze**: 
   - Compare with previous day
   - Identify trends from time_series
   - Summarize bookmarks/likes topics
   - List subscribed lists
3. **Generate Report**: Create comprehensive summary
4. **Save Report**: Write to `reports/xray_me_YYYYMMDD_HHMM.md`
5. **Sync to Obsidian**: Run `bun run scripts/sync-report.ts` (auto-syncs latest report)

## Data Structure

### me-data.json

```typescript
interface MeData {
  username: string;
  fetched_at: string;
  analytics: {
    current: AnalyticsRecord;      // Current metrics
    previous: AnalyticsRecord;     // Previous fetch (for comparison)
    trend: AnalyticsTrend;         // Calculated changes
    time_series: DailyMetrics[];   // 7-day breakdown
  };
  bookmarks: Tweet[];              // Bookmarked tweets
  likes: Tweet[];                  // Liked tweets
  lists: TwitterList[];            // Subscribed lists
}
```

### DailyMetrics (from time_series)

```typescript
interface DailyMetrics {
  date: string;           // "2026-01-27"
  impressions: number;
  engagements: number;
  profile_visits: number;
  follows: number;
  likes: number;
  replies: number;
  retweets: number;
  bookmarks: number;
}
```

## Database Queries

### Get Latest Analytics

```typescript
import { getLatestAnalytics } from "./lib/analytics-db";
const latest = getLatestAnalytics("zhengli");
```

### Get History (Last 30 Records)

```typescript
import { getAnalyticsHistory } from "./lib/analytics-db";
const history = getAnalyticsHistory("zhengli", 30);
```

## Report Format

Generate a **comprehensive daily report** in **Simplified Chinese**.

### Structure:

```markdown
# 📊 我的 X 日报 | YYYY-MM-DD

---

## 📈 核心指标

| 指标 | 当前值 | 变化 | 趋势 |
|------|--------|------|------|
| 粉丝 | 183 | +2 (+1.1%) | ↑ |
| 展示量 | 21,169 | +1,234 (+6.2%) | ↑ |
| 互动量 | 741 | +45 (+6.5%) | ↑ |
| 互动率 | 3.50% | +0.1 (+2.9%) | ↑ |
| 主页访问 | 72 | +5 (+7.5%) | ↑ |

---

## 📅 7天趋势

| 日期 | 展示量 | 互动 | 新粉 | 点赞 |
|------|--------|------|------|------|
| 01-21 | 4,319 | 165 | 6 | 3 |
| 01-22 | 4,082 | 66 | 4 | 19 |
| ... | ... | ... | ... | ... |

---

## 🔖 最近收藏 ({count} 条)

1. **@username**: Tweet text preview... [链接](url)
2. **@username**: Tweet text preview... [链接](url)
...

---

## ❤️ 最近点赞 ({count} 条)

1. **@username**: Tweet text preview... [链接](url)
2. **@username**: Tweet text preview... [链接](url)
...

---

## 📋 订阅列表 ({count} 个)

| 列表 | 成员数 | 订阅数 | 描述 |
|------|--------|--------|------|
| AI / Robotic | 113 | 4,635 | AI Experts... |
| ... | ... | ... | ... |

---

## 🔍 AI 分析

### 亮点
- [基于数据的正面发现]

### 关注
- [需要关注的趋势]

### 建议
- [可操作的建议]

---

*数据来源: Twitter Analytics API*
*生成时间: YYYY-MM-DD HH:MM UTC+8*
```

## User Intent Examples

- "看看我的 X 数据"
- "My Twitter analytics"
- "生成今日 X 报告"
- "我的账号最近怎么样？"
- "帮我看看粉丝增长情况"
- "分析一下我的推特"

## Completion Notification

After pipeline completes (success or failure), **MUST** call `task-notifier` skill:

```bash
# On success
python3 /Users/nocoo/workspace/personal/skill-task-notifier/scripts/notify.py "X-Ray Me 完成：粉丝 {followers} (+{change})" success

# On failure
python3 /Users/nocoo/workspace/personal/skill-task-notifier/scripts/notify.py "X-Ray Me 失败：{error}" error
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `bun run scripts/fetch-me-data.ts` | Fetch all data (analytics, bookmarks, likes, lists) |
| `bun run scripts/sync-report.ts` | Sync latest report to Obsidian |
| `bun run scripts/fetch-analytics.ts` | Fetch analytics only (legacy) |

## Data Files

| File | Description |
|------|-------------|
| `data/me-data.json` | Complete fetch result with all data |
| `data/analytics.json` | Analytics only (legacy) |
| `data/x-ray.db` | SQLite database (analytics history) |
| `config/config.json` | API keys and user config |
| `reports/xray_me_*.md` | Generated reports |
