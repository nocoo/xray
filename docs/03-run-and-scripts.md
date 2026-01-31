# 运行方式与脚本

## 环境准备

```bash
bun install
cp config/config.example.json config/config.json
```

## 运行方式

本项目没有传统 dev server，主要通过脚本或 Skills 运行。

### Skills 入口

- `/xray-watchlist`：观察名单拉取 + 分析 + 报告生成
- `/xray-me`：个人分析数据拉取 + 报告生成

### 常用脚本

- `bun run scripts/fetch-tweets.ts`：拉取观察名单推文
- `bun run scripts/fetch-me-data.ts`：拉取个人分析数据
- `bun run scripts/generate-watchlist-report.ts`：生成观察名单报告
- `bun run scripts/generate-me-report.ts`：生成个人分析报告
- `bun run scripts/run-watchlist-report.ts`：一键执行拉取 + 校验 + 生成

## 数据依赖

- `data/analyze_output.json` 由分析流程产出，缺失时会阻止生成报告
