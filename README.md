<p align="center">
  <img src="public/logo-80.png" alt="X-Ray Logo" width="80" height="80">
</p>

<h1 align="center">X-Ray</h1>

<p align="center">
  <strong>Twitter/X 内容监控与洞察系统</strong><br>
  实时追踪 · 深度分析 · 数据驱动
</p>

<p align="center">
  <img src="https://img.shields.io/badge/vinext-Vite+Next.js-black" alt="vinext">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-local-green" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

<p align="center">
  <img src="https://s.zhe.to/dcd0e6e42358/20260305/7e86d7bf-2db7-4163-853e-e4d11961db33.jpg" alt="X-Ray Preview" width="720">
</p>

---

## ✨ 功能特点

- 📋 **Watchlist 观察名单** — 创建多个观察名单，自动拉取成员推文，SSE 实时推送进度，支持自动翻译与 AI 洞察
- 👥 **Groups 分组管理** — 自定义分组、批量导入（`following.js` / `followers.js`）、批量编辑与删除、活跃度评估
- 📡 **推文探索** — 全网推文搜索，详情与回复链，统一操作栏（打开 / 翻译 / 保存到 zhe.to）
- 👤 **用户分析** — 用户画像、时间线、高光推文、关注关系（Followers / Following / Affiliates）
- 📊 **个人数据** — 账号指标、趋势图表、书签与点赞（Masonry 瀑布流布局）
- 💬 **私信查看** — 收件箱浏览与对话线程
- 📃 **Lists 列表** — 浏览 Twitter Lists
- 🤖 **AI 翻译** — 信达雅风格中文翻译 + 锐评，支持单条翻译与批量自动翻译
- ⚙️ **AI 设置** — 多 AI 提供商配置（OpenAI / Anthropic / Google / GLM / DeepSeek / Grok / Ollama）
- 🔗 **zhe.to 集成** — 一键保存推文到 zhe.to 书签服务
- 🔑 **Webhooks** — 生成 Webhook Key，支持外部系统通过 API 访问 Twitter 数据
- 📈 **Usage 用量统计** — API 调用量追踪与统计面板
- 🔒 **隐私优先** — 数据完全存储在本地 SQLite，Google OAuth 认证，ScopedDB 行级安全隔离

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
# TweAPI API Key (Twitter 数据源, 从 https://tweapi.io 获取)
TWEAPI_API_KEY=your-tweapi-key

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
>
> 💡 **提示**: `TWEAPI_API_KEY` 也可以在登录后通过 Settings 页面配置，但推荐在 `.env` 中设置作为默认值

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
├── 📂 src/
│   ├── auth.ts                    # NextAuth 配置 (Google OAuth + JWT)
│   ├── proxy.ts                   # 中间件 (认证 + 代理)
│   ├── 📂 app/
│   │   ├── 📂 api/                # API 路由 (session auth + webhook auth)
│   │   │   ├── 📂 watchlists/     # 观察名单 CRUD + SSE 抓取
│   │   │   ├── 📂 groups/         # 分组管理
│   │   │   ├── 📂 twitter/        # Twitter 数据代理 (webhook auth)
│   │   │   ├── 📂 explore/        # 推文搜索 (session auth)
│   │   │   ├── 📂 translate/      # AI 翻译
│   │   │   ├── 📂 profiles/       # Twitter 资料缓存
│   │   │   ├── 📂 tags/           # 标签管理
│   │   │   ├── 📂 integrations/   # zhe.to 集成
│   │   │   └── ...                # credentials, credits, media, settings, usage, webhooks
│   │   ├── 📂 (dashboard)/        # 认证页面 (共享 AppShell 布局)
│   │   │   ├── page.tsx           # Dashboard 首页
│   │   │   ├── 📂 watchlist/      # 观察名单 (列表/详情/日志)
│   │   │   ├── 📂 groups/         # 分组管理
│   │   │   ├── 📂 tweets/         # 推文探索
│   │   │   ├── 📂 users/          # 用户分析
│   │   │   ├── 📂 bookmarks/      # 书签 (Masonry 布局)
│   │   │   ├── 📂 likes/          # 点赞 (Masonry 布局)
│   │   │   ├── 📂 lists/          # Twitter Lists
│   │   │   ├── 📂 messages/       # 私信
│   │   │   ├── 📂 analytics/      # 个人分析
│   │   │   ├── 📂 usage/          # API 用量统计
│   │   │   ├── 📂 webhooks/       # Webhook 管理
│   │   │   ├── 📂 settings/       # 设置
│   │   │   ├── 📂 ai-settings/    # AI 提供商配置
│   │   │   ├── 📂 integrations/   # 第三方集成 (zhe.to)
│   │   │   └── layout.tsx         # 共享布局 + useBreadcrumbs
│   │   └── 📂 login/              # 登录页
│   ├── 📂 components/
│   │   ├── 📂 layout/             # 布局组件 (AppShell, Sidebar, Breadcrumbs)
│   │   ├── 📂 twitter/            # Twitter 业务组件 (TweetCard, UserCard)
│   │   └── 📂 ui/                 # shadcn/ui + MasonryGrid
│   ├── 📂 hooks/                  # useFetch, useSearch, useColumns, useMobile
│   ├── 📂 services/               # AI 翻译服务
│   ├── 📂 db/
│   │   ├── schema.ts              # Drizzle ORM schema (16 tables)
│   │   ├── scoped.ts              # ScopedDB — 按用户隔离的 CRUD (行级安全)
│   │   └── index.ts               # 连接管理 (Bun/Node 双驱动)
│   ├── 📂 lib/
│   │   ├── auth-adapter.ts        # NextAuth 自定义 SQLite adapter
│   │   ├── crypto.ts              # 加密工具 (Webhook Key)
│   │   ├── 📂 twitter/            # TweAPI Provider 层 (ITwitterProvider 接口)
│   │   └── ...                    # api-helpers, utils, palette, tag-color, version
│   └── 📂 __tests__/              # 单元测试 + API E2E 测试
├── 📂 agent/                      # AI Agent 工具 (分析/抓取/研究/工作流)
├── 📂 e2e/                        # Playwright 浏览器 E2E 测试
├── 📂 tests/                      # Agent/脚本集成测试
├── 📂 scripts/                    # CLI 工具脚本
├── 📂 shared/                     # 跨层共享类型定义
├── 📂 docs/                       # 详细文档 (架构/测试/部署/API)
├── 📂 database/                   # SQLite 数据库文件 (gitignored)
├── 📂 drizzle/                    # Drizzle 数据库迁移文件
├── .env.example                   # 环境变量示例
├── Dockerfile                     # Docker 容器化 (多阶段构建)
└── package.json                   # 版本 & 依赖 (唯一版本源)
```

## 🛠️ 技术栈

| 组件 | 选型 |
|------|------|
| ⚡ Runtime | [Bun](https://bun.sh) |
| 🖥️ Framework | [vinext](https://github.com/nicolo-ribaudo/vinext) (Vite + Next.js RSC) |
| 📝 Language | TypeScript (strict mode) |
| 🗄️ Database | SQLite + [Drizzle ORM](https://orm.drizzle.team) |
| 🔐 Auth | [NextAuth.js](https://next-auth.js.org) (Google OAuth + custom SQLite adapter) |
| 🎨 UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| 🌐 API | Next.js API Routes (session auth + webhook key auth) |
| 📊 Charts | [Recharts](https://recharts.org) |

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器 (端口 7027) |
| `bun run build` | 生产构建 |
| `bun start` | 启动生产服务器 |
| `bun test` | 运行单元测试 |
| `bun run test:coverage` | 运行测试并生成覆盖率报告 |
| `bun run test:e2e:browser` | 运行 Playwright 浏览器 E2E 测试 |
| `bun run lint` | ESLint 检查 |
| `bun run db:push` | 推送 schema 到数据库 |
| `bun run db:studio` | 打开 Drizzle Studio |
| `bun run db:generate` | 生成数据库迁移文件 |
| `bun run db:migrate` | 执行数据库迁移 |

> 📖 **详细文档**: 更多关于架构、测试、部署和 API 的文档请参阅 [`docs/`](docs/) 目录

## 🚢 部署

### Docker

```bash
docker build -t xray .
docker run -p 7027:7027 \
  -e TWEAPI_API_KEY=your-key \
  -e GOOGLE_CLIENT_ID=your-id \
  -e GOOGLE_CLIENT_SECRET=your-secret \
  -e NEXTAUTH_SECRET=your-secret \
  -e ALLOWED_EMAILS=you@example.com \
  -e XRAY_DATA_DIR=/data \
  -v xray-data:/data \
  xray
```

### Railway

项目支持 Railway 一键部署，使用 Dockerfile builder。数据库文件挂载到 Volume 以持久化：

- 设置 `XRAY_DATA_DIR` 指向 Volume 挂载路径（如 `/data`）
- `HOSTNAME=0.0.0.0` 已在 Dockerfile 中内置

## 🙏 鸣谢

- **[TweAPI](https://tweapi.io)** — 本项目的 Twitter/X 数据全部通过 TweAPI 获取。毫秒级实时推文 API，无需 Twitter 开发者认证，按量付费，开发者友好。感谢作者 [@PennyJoly](https://x.com/PennyJoly) 提供如此优秀的服务。

## 📄 License

[MIT](LICENSE) © 2026
