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
3. 在 Settings → Push tokens 创建 token，交给采集生产者；完整 token 只在创建时显示。
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

`bun run dev` 自动应用本地 D1 迁移、构建 shared 包，并启动 Vite 和 Worker：

| 入口 | 地址 |
| --- | --- |
| 本地 UI | `http://localhost:7007` |
| 本地 Worker | `http://127.0.0.1:37007` |
| 存活检查 | `http://127.0.0.1:37007/api/live` |

本地环境使用 `dev@xray.local` 身份，不需要配置 Access。Vite 的热更新配置使用 `https://xray.dev.hexly.ai`；需要该开发域名和热更新时，按[架构文档](docs/02-architecture.md)配置 Caddy。

保存 AI key 或 zhe.to webhook 前，需要在 `packages/worker/.dev.vars` 设置 `XRAY_SECRETS_KEK`：32 字节 ASCII 字符串，或解码后为 32 字节的 Base64。其他可选配置见 [.env.example](.env.example)。普通列表操作不依赖这些集成密钥。

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
| Worker HTTP 集成测试 | `bun run --filter @xray/worker test:e2e` |
| 浏览器端到端测试 | `bun run test:l3` |

HTTP 测试会启动本地 Worker 和独立的测试 D1；运行前需要取消 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CF_API_TOKEN` 环境变量。浏览器测试先执行 `bunx playwright install chromium`，并在另一终端保持 `bun run dev` 运行；测试会在本地开发数据库中创建数据。

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
- [变更记录](CHANGELOG.md)

## 许可证

仓库尚未提供 LICENSE 文件。
