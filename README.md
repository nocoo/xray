<p align="center">
  <img src="public/logo-80.png" alt="X-Ray Logo" width="80" height="80">
</p>

<h1 align="center">X-Ray</h1>

<p align="center">
  <strong>Twitter/X 内容监控与洞察系统</strong><br>
  实时追踪 · 深度分析 · 数据驱动
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-local-green" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## ✨ 功能特点

- 📡 **推文探索** — 搜索全网推文，查看详情与回复链
- 👤 **用户分析** — 用户画像、时间线、高光推文、关注关系
- 📊 **个人分析** — 账号指标、趋势图表、书签与点赞管理
- 💬 **私信查看** — 收件箱浏览与对话线程
- 🤖 **AI 分析** — Claude 识别高价值内容并生成洞察报告
- 📝 **Markdown 报告** — 杂志风格报告并同步到 Obsidian
- 🔒 **隐私优先** — 数据完全存储在本地 SQLite

## 🚀 快速开始

### 1️⃣ 安装依赖

```bash
# 需要先安装 Bun: https://bun.sh
bun install
```

### 2️⃣ 配置环境变量

```bash
# 复制示例配置文件
cp .env.example .env
```

编辑 `.env` 文件，配置以下内容：

```bash
# Google OAuth 配置 (从 Google Cloud Console 获取)
# https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret

# NextAuth 密钥 (生成命令: openssl rand -base64 32)
NEXTAUTH_SECRET=your-generated-secret-here

# 允许登录的邮箱列表 (逗号分隔)
ALLOWED_EMAILS=your-email@gmail.com
```

> 💡 **提示**: Google OAuth 回调地址设置为 `http://localhost:7027/api/auth/callback/google`

### 3️⃣ 初始化数据库

```bash
# 创建数据库并应用 schema
bun run db:push
```

### 4️⃣ 启动开发服务器

```bash
bun dev
```

打开浏览器访问 👉 [http://localhost:7027](http://localhost:7027)

## 📁 项目结构

```
x-ray/
├── 📂 database/                  # SQLite 数据库文件
│   └── xray.db                   # 生产数据 (gitignored)
├── 📂 docs/                      # 项目文档
│   ├── 01-overview.md            # 项目概览
│   ├── 02-architecture.md        # 架构设计
│   ├── 03-run-and-scripts.md     # 运行与脚本
│   ├── 04-testing.md             # 测试策略
│   ├── 05-config-and-data.md     # 配置与数据
│   ├── 06-api-tweapi.md          # TweAPI 接口文档
│   ├── 07-agent-scripts.md       # Agent 脚本说明
│   ├── 07-xray-web.md            # Web 端文档
│   ├── 08-deployment.md          # 部署指南
│   └── 09-dashboard-api-roadmap.md # API 路线图
├── 📂 server/                    # Hono API Server (独立进程)
│   ├── 📂 src/                   # 服务端源码
│   └── 📂 tests/                 # 服务端测试
├── 📂 agent/                     # AI Agent 原子化工具
│   ├── 📂 analyze/               # 分析工具
│   ├── 📂 fetch/                 # 数据拉取
│   ├── 📂 research/              # 研究分析脚本
│   └── 📂 workflow/              # 工作流编排
├── 📂 scripts/                   # CLI 工具脚本
│   ├── 📂 lib/                   # 共享库
│   ├── fetch-tweets.ts           # 拉取推文
│   ├── fetch-me-data.ts          # 拉取个人数据
│   ├── generate-watchlist-report.ts # 生成观察名单报告
│   └── generate-me-report.ts     # 生成个人报告
├── 📂 skills/                    # Claude Skills (标准化流程)
│   ├── xray-watchlist/           # 观察名单技能
│   └── xray-me/                  # 个人分析技能
├── 📂 src/
│   ├── 📂 __tests__/             # 单元测试 + API E2E 测试
│   ├── 📂 app/                   # Next.js App Router
│   │   ├── 📂 api/               # API 路由
│   │   ├── 📂 analytics/         # 个人分析页面
│   │   ├── 📂 tweets/            # 推文探索页面
│   │   ├── 📂 users/             # 用户分析页面
│   │   ├── 📂 bookmarks/         # 书签页面
│   │   ├── 📂 likes/             # 点赞页面
│   │   ├── 📂 lists/             # 列表页面
│   │   ├── 📂 messages/          # 私信页面
│   │   ├── 📂 usage/             # 用量统计页面
│   │   ├── 📂 settings/          # 设置页面
│   │   └── page.tsx              # 仪表盘 (首页)
│   ├── 📂 components/            # UI 组件
│   │   ├── 📂 layout/            # 布局组件 (Sidebar, AppShell)
│   │   ├── 📂 twitter/           # Twitter 业务组件
│   │   └── 📂 ui/                # shadcn/ui 基础组件
│   ├── 📂 db/                    # 数据库层
│   │   ├── 📂 repositories/      # CRUD 操作
│   │   ├── schema.ts             # Drizzle schema
│   │   └── index.ts              # 连接管理
│   ├── 📂 lib/                   # 工具函数
│   │   ├── 📂 twitter/           # Twitter Provider 层
│   │   └── version.ts            # 版本管理 (读取 package.json)
│   └── auth.ts                   # NextAuth 配置
├── 📂 tests/                     # Agent / 脚本测试
├── .env.example                  # 环境变量示例
├── drizzle.config.ts             # Drizzle ORM 配置
├── Dockerfile                    # Docker 容器化
└── package.json                  # 版本 & 依赖 (唯一版本源)
```

## 🛠️ 技术栈

| 组件 | 选型 |
|------|------|
| ⚡ Runtime | [Bun](https://bun.sh) |
| 🖥️ Framework | [Next.js 16](https://nextjs.org) (App Router) |
| 📝 Language | TypeScript (strict mode) |
| 🗄️ Database | SQLite + [Drizzle ORM](https://orm.drizzle.team) |
| 🎨 UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| 🔐 Auth | [NextAuth.js](https://next-auth.js.org) (Google OAuth) |
| 🌐 API Server | [Hono](https://hono.dev) (独立 API 代理层) |
| 📊 Charts | [Recharts](https://recharts.org) |

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器 (端口 7027) |
| `bun run build` | 生产构建 |
| `bun start` | 启动生产服务器 |
| `bun test` | 运行单元测试 |
| `bun run lint` | ESLint 检查 |
| `bun run db:push` | 推送 schema 到数据库 |
| `bun run db:studio` | 打开 Drizzle Studio |
| `bun run db:generate` | 生成数据库迁移文件 |
| `bun run db:migrate` | 执行数据库迁移 |

## 🚢 部署

### Docker

```bash
docker build -t xray .
docker run -p 7027:7027 -v xray-data:/app/database xray
```

### Railway

项目支持 Railway 一键部署，使用 Dockerfile builder。数据库文件挂载到 Volume 以持久化：

- 设置 `XRAY_DATA_DIR` 指向 Volume 挂载路径
- 设置 `HOSTNAME=0.0.0.0` (Dockerfile 中已内置)

## 📄 License

[MIT](LICENSE) © 2026
