# 架构与数据流

## 架构概览

系统围绕“拉取 → 分析 → 生成报告”三段式流程组织：

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Fetch     │ -> │   Claude    │ -> │   Report    │
│  (Scripts)  │    │  (AI)       │    │  (Markdown) │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       v                  v                  v
 raw_tweets.json    analyze_output.json   reports/*.md
```

## 主要模块

- `scripts/`：数据拉取、验证与报告生成
- `scripts/lib/`：API、数据库与通用工具
- `skills/`：Claude Skills 的交互入口

## 数据流说明

1. 拉取：从 TweAPI.io 获取推文与个人分析数据
2. 分析：Claude 读取数据并输出结构化洞察
3. 生成：脚本将洞察转为 Markdown 报告
4. 存储：结果进入 `reports/`，可同步到 Obsidian
