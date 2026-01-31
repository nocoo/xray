# 🔍 X-Ray

用于监控 Twitter/X 观察名单并生成洞察型 Markdown 报告的系统。📘

## ✨ 主要功能

- 📡 观察名单监控：拉取指定用户的推文
- 📊 个人分析：账号指标、趋势、书签与点赞
- 🤖 AI 分析：Claude 识别高价值内容并生成洞察
- 📝 Markdown 报告：杂志风格报告并同步到 Obsidian

## 🧭 文档导航

- `docs/01-overview.md`
- `docs/02-architecture.md`
- `docs/03-run-and-scripts.md`
- `docs/04-testing.md`
- `docs/05-config-and-data.md`
- `docs/06-api-tweapi.md`

## 🚀 快速开始

```bash
bun install
cp config/config.example.json config/config.json
```

在 `config/config.json` 中配置 TweAPI.io 的 `api_key` 后运行：

```bash
/xray-watchlist
```

## 🧱 主要目录结构

```
x-ray/
├── scripts/               # CLI 脚本
│   ├── lib/               # 共享库
│   ├── fetch-tweets.ts
│   ├── fetch-me-data.ts
│   ├── generate-watchlist-report.ts
│   └── generate-me-report.ts
├── skills/                # Claude Skills
│   ├── xray-watchlist/
│   └── xray-me/
├── tests/                 # 单元测试
├── docs/                  # 项目文档
├── config/                # API Key（gitignored）
└── data/                  # 运行数据（gitignored）
```

## 🧪 测试

- 运行：`bun test`
- 覆盖率目标：单元测试覆盖率不低于 90%
- E2E 测试仅在明确要求时执行（避免真实 API 成本）

## 🧰 开发运行方式（给 Agent 的说明）

- 本项目没有传统 dev server；通过脚本或 Skills 运行
- 技能入口：`/xray-watchlist`、`/xray-me`
- 脚本入口：`bun run scripts/<script>.ts`

## 📚 文档要求（给 Agent 的说明）

- 更新代码时必须同步更新相关文档
- README 仅做概览，细节下沉到 `docs/` 分层文档
- 文档以中文为主，结构清晰、可追溯

## ✅ 质量与提交要求（给 Agent 的说明）

- 单元测试覆盖率目标 90%
- 提交必须原子化，遵循 Conventional Commits
- 若变更触及核心逻辑，先确保 `bun test` 通过
