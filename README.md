<p align="center">
  <img src="assets/brand/icon-rounded.png" alt="Xray" width="128" height="128" />
</p>

<h1 align="center">Xray</h1>

<p align="center">按关注列表收集和阅读 X / Twitter 与自定义来源的内容。</p>

<p align="center">
  <a href="https://xray.hexly.ai">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Xray 是一个内容监测与阅读工具。你可以把账号分成关注列表，让本地采集脚本或其他生产者推送内容，再在同一时间线中阅读、翻译和保存链接。

当前应用运行在 Cloudflare Workers 和 D1 上，浏览器入口通过 Cloudflare Access 登录。内容通过独立的 ingest 入口写入；Worker 本身不定时抓取 X。仓库提供基于 `twitter-cli` 的本地采集脚本，自定义来源需要按接口协议接入自己的生产者。

## 功能

- 创建关注列表，为成员添加标签和备注；按 `x.com`、`custom` 或全部来源查看分页时间线。
- 用 Groups 复用账号集合，从含用户名的 Twitter 导出文本批量导入，再复制到关注列表。
- 通过 Push token 读取关注列表成员并推送内容，按来源 ID 去重，记录接受、重复和拒绝的条目。
- 在仪表盘查看关注列表、成员、近期内容和采集记录，调整内容接收时间窗口。
- 配置兼容 OpenAI Chat Completions 的服务，按条目或批次翻译；配置摘要提示词后同时生成摘要。
- 配置 zhe.to webhook，将时间线中的链接保存到指定文件夹。

## 使用

1. 打开[站点](https://xray.hexly.ai)，使用获准的账号通过 Cloudflare Access 登录。
2. 创建关注列表并添加成员，也可以先在 Groups 整理账号后复制进去。
3. 在 Channels 中创建频道，并在频道设置中创建具名 Push token，供 AI 投递 Markdown 报告；完整 token 只在创建时显示。Watchlist 采集 token 仍通过浏览器认证 API 管理，见[本地生产者说明](docs/09-local-producer-twitter-cli.md)。
4. 推送完成后，在关注列表中阅读内容。需要翻译或保存链接时，分别配置 AI Settings 和 Integrations → zhe.to。

本地 X 采集需要 macOS / Linux、Bun、Python 3（使用 `fcntl` 进程锁）、已安装并登录的 `twitter-cli`，以及 Xray Push token。按[本地生产者文档](docs/09-local-producer-twitter-cli.md)配置后，在仓库根目录运行：

```bash
bun run build:shared
bun run refresh:watchlists -- --help
bun run refresh:watchlists -- --dry-run
bun run refresh:watchlists --
```

`--dry-run` 仍会向 ingest 服务读取成员列表，但不访问 X 或推送内容。完整采集默认将账号请求分散在 60 分钟内；结果受账号登录状态、上游限流和可获取的时间线内容影响。自定义生产者使用 `GET /api/v1/ingest/graph` 和 `POST /api/v1/ingest/push`，协议见[数据模型与接入](docs/03-data-model-and-ingest.md)。

## 开发

项目使用 Bun workspace，`packageManager` 指定 Bun 1.3.14。安装 Bun 后，从仓库根目录执行：

```bash
git clone https://github.com/nocoo/xray.git
cd xray
bun install --frozen-lockfile
bun run dev
```

`bun run dev` builds the shared package and starts the managed gateway. Open **https://xray.dev.hexly.ai** through Caddy for local preview and HMR. The gateway listens on 7007; native Worker and inspector ports are allocated dynamically.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Resolve launcher mode, valid saved preference, then Demo |
| `bun run dev -- --mode demo` | Explicit persistent Demo session |
| `bun run dev -- --mode e2e` | Fresh manual E2E session, locked until shutdown |
| `bun run preview -- --mode demo` | Build and serve the same UI from `packages/worker/static` |
| `bun run env:db -- init --mode demo` | Initialize owned Demo storage and fixtures |
| `bun run env:db -- migrate --mode demo` | Apply current migrations to Demo |
| `bun run env:db -- seed --mode demo` | Seed only an unseeded Demo store |
| `bun run env:db -- reset --mode demo` | Explicitly replace Demo data and discard its edits |

Stop the active Demo session before database commands. Demo persists in `packages/worker/.wrangler/environments/demo`; normal restarts retain edits. E2E uses a new owned `e2e-*` directory and cleans it up on shutdown. The retired `.wrangler/state-mock` store is preserved untouched.

The local header shows **Demo | E2E | Prod**. Accepted interactive choices persist as a mode enum; switching checks unsaved drafts and reloads the home page. API requests and reader caches remain bound to the accepted instance, so an old request cannot become a write to another backend. E2E disables both alternatives until shutdown. Hosted deployments ignore local preferences; cloud CI also hides the control.

Demo/E2E retain real JWT verification with signed fixture identities, production migrations and normal CRUD. Known external services use native fixture bindings, and the launcher provisions local encryption keys; do not configure daily `.dev.vars` for these sessions. Channel Markdown and related-preview images remain external HTTPS links. See the [environment contract](docs/12-local-environments.md) and [fixture matrix](docs/13-environment-fixtures.md).

Local Prod connects to the deployed API with the real Access identity. Its edits, deletions, translations and integrations can affect production data. Install `cloudflared`, sign in, then explicitly select Prod:

```bash
bun run login:prod
bun run dev -- --mode prod
```

Credentials stay on the local server. Automated tests never select the real Prod service. Both Vite and locally served built assets support the same environment contract; only a trusted launcher injects the bootstrap marker, including automated CI with a hidden control.

```bash
bun run build       # shared、UI 和 Worker 的部署预检构建
bun run typecheck
bun run lint
```

自建部署需要自己的 D1、浏览器与 ingest 域名、Access 配置和服务端密钥；先调整 [wrangler.toml](packages/worker/wrangler.toml)，再按架构文档部署。仓库配置包含维护者的生产资源信息。

```text
packages/ui/        React 页面、组件和 viewmodel
packages/worker/    Hono API、D1 仓储与迁移
packages/shared/    内容协议、采集适配器与共享类型
scripts/           本地采集和数据迁移工具
e2e/               浏览器端到端测试
legacy/v1/         旧版 vinext 应用
```

## 测试

安装依赖并运行 `bun run build:shared` 后，从仓库根目录执行：

| 测试层 | 命令 |
| --- | --- |
| 共享逻辑、UI 与 Worker 单元测试 | `bun run test` |
| Worker HTTP integration + route inventory | `bun run test:l2` |
| 浏览器端到端测试 | `bun run test:l3` |

L2 and L3 own their fresh native E2E resources and reject inherited production credentials. Use `bun run test:l2` for HTTP tests plus the endpoint inventory gate. Install Chromium with `bun x --no-install playwright install chromium`; `bun run test:l3` builds the application, starts its own gateway and Worker, supplies signed identities and addresses, and cleans up afterward. Direct unmanaged Playwright invocation is rejected. Do not point tests at daily Demo or Prod.

On 2026-09-27, the full native L2 suite passed 41 tests across six files with cleanup, including concurrency and ownership regressions. The final managed L3 suite passed 25/25 in 2.4 minutes with cleanup. Google Chrome acceptance through the local Caddy address passed persistence, draft guards, switching and the manual E2E lifecycle; six captured product surfaces were reviewed. CI execution, real Prod verification and a complete visual audit remain unverified. See [6DQ](docs/06-testing-6dq.md), [AGENTS.md](AGENTS.md) and the [current verification record](docs/12-local-environments.md).

## 技术栈

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflareworkers&logoColor=white)
![D1](https://img.shields.io/badge/D1-F38020?logo=cloudflare&logoColor=white)

| 部分 | 实现 |
| --- | --- |
| Web 界面 | React、Vite、React Router、Tailwind CSS、Recharts |
| API 与数据 | Hono、Cloudflare Workers、D1；Cloudflare Access 登录 |
| 采集 | Bun / TypeScript 脚本、twitter-cli 适配器、Python 进程锁 |
| 开发与测试 | Bun workspace、Turborepo、Biome、Vitest、Playwright |

## 文档

- [文档索引](docs/README.md)
- [架构与环境配置](docs/02-architecture.md)
- [数据模型与推送协议](docs/03-data-model-and-ingest.md)
- [功能说明](docs/04-features.md)
- [本地采集生产者](docs/09-local-producer-twitter-cli.md)
- [采集调度](docs/10-refresh-schedule.md)
- [Local environments](docs/12-local-environments.md)
- [Environment fixtures](docs/13-environment-fixtures.md)
- [变更记录](CHANGELOG.md)

## 许可证

仓库尚未提供 LICENSE 文件。
