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
- 🤖 **AI 翻译** — 信达雅风格中文翻译 + 锐评，支持单条翻译与批量自动翻译
- 🔗 **zhe.to 集成** — 一键保存推文到 zhe.to 书签服务
- 🔒 **隐私优先** — 数据完全存储在本地 SQLite，Google OAuth 认证

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
├── 📂 database/                  # SQLite 数据库文件
│   └── xray.db                   # 生产数据 (gitignored)
├── 📂 shared/                    # 跨层共享类型定义
│   └── types.ts                  # Tweet, UserInfo, Conversation 等
├── 📂 agent/                     # AI Agent 原子化工具
│   ├── 📂 analyze/               # 分析工具
│   ├── 📂 fetch/                 # 数据拉取
│   └── 📂 workflow/              # 工作流编排
├── 📂 scripts/                   # CLI 工具脚本
├── 📂 src/
│   ├── 📂 __tests__/             # 单元测试 + API E2E 测试
│   ├── 📂 app/
│   │   ├── 📂 api/               # API 路由 (session auth + webhook auth)
│   │   └── 📂 (dashboard)/       # 认证页面 (共享 AppShell 布局)
│   │       ├── 📂 watchlist/     # 观察名单 (列表/详情/日志)
│   │       ├── 📂 groups/        # 分组管理
│   │       ├── 📂 tweets/        # 推文探索
│   │       ├── 📂 users/         # 用户分析
│   │       ├── 📂 bookmarks/     # 书签 (Masonry 布局)
│   │       ├── 📂 likes/         # 点赞 (Masonry 布局)
│   │       ├── 📂 messages/      # 私信
│   │       ├── 📂 analytics/     # 个人分析
│   │       ├── 📂 settings/      # 设置
│   │       ├── 📂 integrations/  # 第三方集成 (zhe.to)
│   │       └── layout.tsx        # 共享布局 + useBreadcrumbs
│   ├── 📂 components/            # UI 组件
│   │   ├── 📂 layout/            # 布局组件 (Sidebar, AppShell)
│   │   ├── 📂 twitter/           # Twitter 业务组件 (TweetCard, UserCard)
│   │   └── 📂 ui/                # shadcn/ui + MasonryGrid
│   ├── 📂 hooks/                 # 自定义 Hooks
│   │   ├── use-api.ts            # useFetch, useSearch, useMutation
│   │   └── use-columns.ts        # 响应式列数 (matchMedia)
│   ├── 📂 db/                    # 数据库层
│   │   ├── schema.ts             # Drizzle schema
│   │   ├── scoped.ts             # ScopedDB — 按用户隔离的 CRUD
│   │   └── index.ts              # 连接管理
│   └── 📂 lib/                   # 工具函数与 Provider 层
├── .env.example                  # 环境变量示例
├── Dockerfile                    # Docker 容器化
└── package.json                  # 版本 & 依赖 (唯一版本源)
```

## 🛠️ 技术栈

| 组件 | 选型 |
|------|------|
| ⚡ Runtime | [Bun](https://bun.sh) |
| 🖥️ Framework | [vinext](https://github.com/nicolo-ribaudo/vinext) (Vite + Next.js API on Cloudflare Workers) |
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

## 🙏 鸣谢

- **[TweAPI](https://tweapi.io)** — 本项目的 Twitter/X 数据全部通过 TweAPI 获取。毫秒级实时推文 API，无需 Twitter 开发者认证，按量付费，开发者友好。感谢作者 [@PennyJoly](https://x.com/PennyJoly) 提供如此优秀的服务。

## 📄 License

[MIT](LICENSE) © 2026
