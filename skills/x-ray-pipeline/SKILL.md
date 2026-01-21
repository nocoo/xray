---
name: x-ray-pipeline
description: Orchestrates the complete X-Ray workflow - fetch tweets, classify content, generate report, and render HTML. Use when user wants to run the full monitoring pipeline or get a summary of tech tweets.
---

# X-Ray Pipeline Skill

This skill orchestrates the complete X-Ray monitoring workflow.

## Full Pipeline

When user wants to run the complete flow:

1. **Fetch tweets** (Script)
   ```bash
   bun run scripts/fetch-tweets.ts
   ```

2. **Classify tweets** (AI - use x-ray-classify skill)
   - Read `data/raw_tweets.json`
   - Classify each tweet
   - Write to `data/classified.json`

3. **Generate report** (Script)
   ```bash
   bun run scripts/generate-report.ts
   ```

4. **Render HTML** (Script)
   ```bash
   bun run scripts/render-report.ts
   ```

5. **Summarize results** to user

## User Intent Examples

- "Run the full pipeline"
- "Get me the latest tech tweets"
- "What's new in AI today?"
- "执行完整的监控流程"
- "帮我看看最近有什么技术热点"
- "生成报告并打开浏览器查看"

## Quick Commands

| Command | Description |
|---------|-------------|
| `bun run scripts/fetch-tweets.ts` | Fetch from all watched users |
| `bun run scripts/fetch-tweets.ts --hours 48` | Fetch last 48 hours |
| `bun run scripts/generate-report.ts` | Generate final JSON report |
| `bun run scripts/generate-report.ts --all` | Include all tweets in report |
| `bun run scripts/render-report.ts` | Render latest report to HTML |
| `bun run scripts/render-report.ts --serve` | Render and start local server |

## Output Locations

| File | Description |
|------|-------------|
| `data/raw_tweets.json` | Raw fetched tweets |
| `data/classified.json` | Classification results |
| `data/output/{date}_report.json` | Final JSON report |
| `public/{date}_report.html` | Rendered HTML report |
| `public/index.html` | Latest report (always updated) |

## Viewing the Report

After rendering, users can:

1. **Open directly**: `open public/index.html`
2. **Start server**: `bun run serve` then visit http://localhost:3000

## Presenting Results

After generating the report, summarize for the user:
1. Total tweets fetched
2. Number of tech-related tweets
3. Number of hot topic tweets
4. Top categories
5. Highlight 3-5 most relevant tweets with links
6. Provide path to HTML report for viewing
