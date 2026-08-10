# 07 — Implementation Plan（执行细化）

**分支：直接在 `main` 开发（D8）。**  
**每次逻辑变更原子 commit**（conventional commits，单逻辑、可构建/可测）。  
**决策已锁定**：见 [08](08-open-questions.md)。

---

## 总览：五个阶段

| 阶段 | 名称 | 目标一句话 | 主要出口 |
|------|------|------------|----------|
| **S1** | 存档 + 新结构 | v1 代码进 `legacy/`，monorepo 骨架可 install | `packages/*` 空壳 + 根工具链 |
| **S2** | 可登录 Mock 架子 | Access 登录 + 真 sidebar + 各页 mock 内容 | 本地打开全站导航，数据全假 |
| **S3** | 6DQ 自动化（不含 E2E） | L1+G1 pre-commit；L2+G2 pre-push | hook 强制绿，无 Playwright |
| **S4** | Schema + 数据迁移 | D1 migrations + 迁 WL/Groups | local D1 有真实名单，items 空 |
| **S5** | 逐模块功能 + 递增 E2E | 真 API/真 push/真 AI… 直到完工 | L3 套件覆盖核心路径；2.0.0 |

```
S1 archive+scaffold
    → S2 shell+access+mock pages
        → S3 hooks (L1/L2/G1/G2)
            → S4 schema+migrate
                → S5 modules + growing e2e → cutover
```

**原则**

1. **S2 不做真业务写库**（除 users upsert）；页面 VM 读 mock 或空 API。
2. **S3 在业务堆高前锁质量门**，避免后期 hook 补不上。
3. **S4 在模块开发前落 schema**，S5 只加列不推翻。
4. **S5 每完成一个模块：实现 → L1/L2 → 补一条 L3 → commit**。
5. **禁止** auto-refresh / TweAPI / 迁 posts。

---

## S1 — 存档旧项目 + 创建新结构

### 目标

- 旧 vinext 应用整体迁入仓库内 `legacy/v1/`（**代码**存档；docs 已在 `docs/legacy/`）。
- 新建 bat 式 monorepo：`packages/{shared,ui,worker}`。
- 根：Bun workspaces、TS7、Biome、turbo、`.gitignore` 更新。
- 保留 `database/xray.db`（或拷贝到 `legacy/v1/database/`）供 S4 迁移输入。

### 不做

- 不实现业务页、不配 Access、不写 D1 schema（最多 empty migration placeholder）。
- 不删 git 历史；是移动路径。

### 建议目录（S1 结束）

```
xray/
├── package.json              # workspaces, scripts stubs
├── biome.json
├── turbo.json
├── tsconfig.base.json
├── docs/                     # 已有 v2 设计
├── legacy/
│   └── v1/                   # 原 src/, e2e/, agent/, Dockerfile, old package.json…
├── packages/
│   ├── shared/               # package.json + src/index.ts
│   ├── ui/                   # package.json + vite stub
│   └── worker/               # package.json + wrangler.toml stub + src/index.ts
├── database/                 # xray.db 保留或 symlink 说明
└── scripts/                  # 可先空
```

### 原子提交清单

| # | Commit message | 内容 |
|---|----------------|------|
| S1.1 | `chore: create legacy/v1 and move vinext app tree` | `src/`, `e2e/`, `agent/`, `tests/`(若纯 v1), old configs → `legacy/v1/`；保留 `docs/`、`database/` |
| S1.2 | `chore: root workspace with ts7 biome turbo` | 根 `package.json` workspaces；biome；tsconfig；去掉 eslint 依赖（或暂留不引用） |
| S1.3 | `feat(shared): scaffold @xray/shared package` | 空 export + `tsc` |
| S1.4 | `feat(worker): scaffold @xray/worker with wrangler` | Hono `GET /api/live` 返回 version；`wrangler.toml` D1 binding 名占位 |
| S1.5 | `feat(ui): scaffold @xray/ui vite app` | 空白 React「ok」页；port 7007；allowedHosts |
| S1.6 | `docs: readme rewrite-in-progress banner` | 根 README 标明 main 重建中、如何跑 packages |

### 出口验收

```bash
bun install
bun run --filter @xray/worker dev   # /api/live 200
bun run --filter @xray/ui dev       # 浏览器有占位页
# legacy/v1 可检索到旧代码；仓库根无 vinext 入口
```

---

## S2 — 完整架构架子：可登录 + Sidebar + Mock 页

### 目标

端到端 **视觉与导航** 可用：

1. **CF Access**（本地 bypass）后进入 App Shell。
2. **Sidebar** 复制 v1 视觉（折叠、动态区结构），菜单仅为 v2 范围。
3. 路由齐：Dashboard / Watchlists / WL detail / Groups / Group detail / Integrations/zheto / AI Settings / Settings / Push tokens。
4. 每个页面 **ViewModel + mock 数据**；Worker 可提供 `/api/me` + mock JSON 或 UI 内 mock port。
5. 全局 CSS / palette / shadcn 组件从 `legacy/v1` **复制**到 `packages/ui`。

### 架构落地（本阶段必须齐）

| 层 | 交付 |
|----|------|
| Worker | Access middleware（prod verify / `AUTH_DEV_BYPASS`）；`/api/me`；`/api/live`；CORS 如需 |
| UI | react-router；AppShell；sidebar；theme；MVVM 目录约定 |
| Shared | `SourceType`、基础 DTO 类型（可无完整 ingest） |

### 页面 Mock 规格

| 路由 | Mock 内容 |
|------|-----------|
| `/` | 假统计卡片、假近期 activity |
| `/watchlist` | 2–3 个假 WL 卡片 |
| `/watchlist/:id` | 假 members + 假 timeline（混 x.com/custom 卡片样式） |
| `/groups` | 假 groups |
| `/groups/:id` | 假 members |
| `/integrations/zheto` | 表单 UI，submit toast mock |
| `/ai-settings` | gecko 风格表单 UI，不连真 AI |
| `/settings` | profile email from `/api/me` |
| `/settings/tokens` | 假 token 列表 UI |

### 原子提交清单

| # | Commit message | 内容 |
|---|----------------|------|
| S2.1 | `feat(ui): port global css palette and shadcn primitives` | 从 legacy 拷样式与基础 UI |
| S2.2 | `feat(ui): app shell and sidebar navigation` | 布局+导航项（无 Explore/My Account/Usage/Webhooks） |
| S2.3 | `feat(worker): cf access middleware with dev bypass` | bat/surety 模式；fail-closed 单测可放 S3，本步至少可运行 |
| S2.4 | `feat(worker): api me endpoint` | 从 Access/bypass 解析 email → users 内存或暂 sqlite/d1 最小 users 表 |
| S2.5 | `feat(ui): session gate and me client` | 未登录/bypass 行为 |
| S2.6 | `feat(ui): mock dashboard and watchlist pages` | VM + mock |
| S2.7 | `feat(ui): mock groups integrations ai-settings settings tokens` | 其余路由 |
| S2.8 | `feat(ui): tweet and custom item card shells` | 视觉组件，绑 mock CanonicalItem |
| S2.9 | `chore: caddy dev proxy notes and package scripts` | `bun dev` 并行 ui+worker |

### 出口验收

- 浏览器打开 `https://xray.dev.hexly.ai`（或 localhost）：bypass 下进壳。
- Sidebar 点遍所有路由，无白屏；内容为 mock。
- 视觉与 v1 shell/tweet-card **观感一致**（允许数据假）。
- 仍无真实 push/AI/迁移。

---

## S3 — 6DQ 自动化（除 E2E 外）

### 目标

质量门在业务堆高前就位。对齐 bat hook 模型：

| Hook | 跑什么 | 不跑 |
|------|--------|------|
| **pre-commit** | **L1** unit+coverage；**G1** biome + tsc；gitleaks staged | Playwright；重 L2 |
| **pre-push** | **L2** worker HTTP + **local D1**；**G2** osv-scanner + gitleaks | Playwright L3 |

**L3 Playwright：S5 才引入**，且默认 **不进 pre-push**（CI 或 `bun run test:e2e` 手动/CI），避免早期过慢。若后续要进 pre-push，单独立项。

### 本阶段必须存在的测试资产

| 资产 | 说明 |
|------|------|
| `packages/*/vitest.config.ts` | L1 |
| `scripts/check-coverage.sh` | 阈值（参考 bat 90/95） |
| `packages/worker/src/test-helpers/mock-d1.ts` | better-sqlite3 |
| `packages/worker/test/l2/*` + `global-setup` | `wrangler dev --local --persist-to .wrangler/state-l2` |
| `.husky/pre-commit` / `pre-push` | 并行 stage、fail-fast |
| `gate:security` script | osv + gitleaks |

### 最低 L1/L2 用例（S3 内写绿）

- shared：`SourceType` 常量、window helper
- worker：access-auth bypass/fail-closed；`/api/live`；`/api/me`
- ui：1–2 个 VM 纯测（mock port）
- L2：live + me over wrangler local

### 原子提交清单

| # | Commit message | 内容 |
|---|----------------|------|
| S3.1 | `test(shared): vitest and source type unit tests` | |
| S3.2 | `test(worker): mock-d1 helper and live unit tests` | |
| S3.3 | `test(worker): access-auth unit tests` | |
| S3.4 | `test(ui): viewmodel unit tests with mock api` | |
| S3.5 | `test(worker): l2 http harness with wrangler local d1` | global-setup + live/me |
| S3.6 | `chore: coverage gate script` | check-coverage |
| S3.7 | `chore: husky pre-commit l1 g1 gitleaks` | 替换旧 eslint hook |
| S3.8 | `chore: husky pre-push l2 and g2 security` | |
| S3.9 | `ci: add gha workflow optional mirror of hooks` | 可选但推荐 |

### 出口验收

```bash
# 模拟 pre-commit
bun run lint && bun run typecheck && bun run test:unit:coverage && gitleaks protect --staged
# 模拟 pre-push
bun run test:l2 && bun run gate:security
# 故意写坏一个 L1 → commit 被拒
```

---

## S4 — 数据库 Schema + 迁移数据

### 目标

1. 完整 D1 SQL migrations（与 [03](03-data-model-and-ingest.md) / [05](05-migration.md) 一致）。
2. `scripts/migrate-v1-to-d1.ts`：从 `legacy/v1` 或 `database/xray.db` 导入 **users / watchlists / members / tags / groups**（**无 posts**）。
3. local D1 apply + 跑迁移后，UI **仍可先读 mock**；可选：WL 列表 API 改读 D1（推荐本阶段结束时 list API 已真连 D1）。

### Schema 范围（一次到位）

- users  
- push_tokens  
- watchlists, watchlist_members, tags, watchlist_member_tags  
- groups, group_members  
- items（空表，供 S5）  
- ingest_logs  
- settings / ai_configs  
- zheto 相关 settings keys  

### 原子提交清单

| # | Commit message | 内容 |
|---|----------------|------|
| S4.1 | `feat(worker): d1 migration 0001 init schema` | 全表 |
| S4.2 | `feat(worker): repos for users watchlists groups` | scoped |
| S4.3 | `feat(worker): watchlists and groups read apis` | GET list/detail from D1 |
| S4.4 | `feat(ui): wire watchlist and group lists to api` | 去掉 list mock；detail 仍可部分 mock |
| S4.5 | `feat(scripts): migrate-v1-to-d1` | |
| S4.6 | `chore: apply local migration and import snapshot` | 文档命令；不 commit db 文件 |
| S4.7 | `test(worker): l1 repos + l2 list apis after migrate` | |

### 出口验收

```bash
wrangler d1 migrations apply xray-db --local
bun run scripts/migrate-v1-to-d1.ts --sqlite database/xray.db --local
# SQL counts ≈ v1（减 e2e user）
# UI /watchlist 显示真实名称；/watchlist/:id items 为空空态
```

---

## S5 — 逐模块实现 + 递增 E2E

### 目标

按模块切片交付 **真功能**；每片：

1. TDD：L1 domain/repo → L2 HTTP → 实现  
2. UI VM 接真 API  
3. **新增/扩展 L3 Playwright** 一条路径  
4. **原子 commit**（可 1 模块多 commit，但每 commit 可测）

L3 放在 `packages/ui/e2e/*.pw.ts`；`bun run test:e2e`；**CI 跑 L3**；pre-push 仍以 L2 为主（L3 可另 job）。

### 模块顺序（推荐依赖序）

```
M1 Push tokens
M2 Ingest push + items timeline
M3 Watchlist members CRUD + filters
M4 AI settings + translate/summary
M5 Groups write paths + add-to-watchlist
M6 Dashboard aggregates (real)
M7 zhe.to integration
M8 Polish + strip legacy runtime refs + release 2.0.0
```

### 各模块细化

#### M1 — Push tokens

| Commits（示例） | 内容 |
|-----------------|------|
| `feat(worker): push_tokens mint list revoke api` | Access-only mint |
| `feat(ui): push tokens settings page live` | |
| `test(worker): l2 push tokens` | |
| `test(e2e): tokens page create revoke` | 首条 L3 骨架 + 本路径 |

**出口**：UI 创建 token → 复制一次 → 列表可见 → 吊销后失效。

#### M2 — Ingest + mixed timeline

| Commits | 内容 |
|---------|------|
| `feat(shared): canonical item schemas` | zod/valibot |
| `feat(worker): post ingest push pipeline` | window gate, dedupe |
| `feat(worker): items list api` | |
| `feat(ui): watchlist detail timeline from api` | source filter |
| `test(worker): l1 normalizer fixtures + l2 push` | |
| `test(e2e): push x.com and custom into timeline` | |

**出口**：curl/脚本 push 两条不同 source → 页面 mix 可见。  
**无** 自动刷新。

#### M3 — Watchlist members

| Commits | 内容 |
|---------|------|
| `feat(worker): members and tags write apis` | |
| `feat(ui): members manager live` | |
| `test(l2+e2e): add remove member` | |

#### M4 — AI

| Commits | 内容 |
|---------|------|
| `feat(worker): ai config storage and test endpoint` | gecko patterns |
| `feat(ui): ai-settings live` | |
| `feat(worker): translate and summary on items` | |
| `feat(ui): translate action on watchlist` | |
| `test(l1+l2): ai + translate` | mock model |
| `test(e2e): ai settings save and translate smoke` | 可用 mock provider |

#### M5 — Groups writes

| Commits | 内容 |
|---------|------|
| `feat(worker+ui): groups crud and bulk import` | |
| `feat: add group members to watchlist` | |
| `test(e2e): groups crud` | |

#### M6 — Dashboard real

| Commits | 内容 |
|---------|------|
| `feat(worker): dashboard summary api` | |
| `feat(ui): dashboard live widgets` | |
| `test(e2e): dashboard shows counts` | |

#### M7 — zhe.to

| Commits | 内容 |
|---------|------|
| `feat: zheto integration full port` | from legacy/v1 |
| `test(e2e): zheto settings form` | |

#### M8 — Cutover

| Commits | 内容 |
|---------|------|
| `chore: remove dead v1 scripts from root if any` | |
| `chore: prod wrangler env secrets d1` | |
| `chore: migrate prod metadata` | |
| `test: full e2e suite green in ci` | |
| `release: 2.0.0` | |
| `chore: decommission railway notes` | |

### S5 出口验收（全部开发完成）

- [ ] Push mix timeline  
- [ ] Members/tags  
- [ ] AI translate + summary  
- [ ] Groups  
- [ ] Dashboard  
- [ ] zhe.to  
- [ ] Tokens  
- [ ] `rg -i tweapi` 非 legacy = 0  
- [ ] pre-commit / pre-push 绿  
- [ ] L3 核心路径绿  
- [ ] 无 cron / auto-refresh  

---

## 提交与钩子纪律（全程）

1. **main only**；一步一 commit；message ≤50 字符主题，正文可说明。  
2. **Never** `git add -A`；只 stage 本逻辑文件。  
3. S3 之后每次 commit 必须过 pre-commit；push 过 pre-push。  
4. S5 起相关模块 PR/推送前跑 `bun run test:e2e`。  
5. 大迁移（S1.1、S4.6）单独 commit，不与功能混提。

---

## 阶段依赖与并行（有限）

| 可并行 | 说明 |
|--------|------|
| S2 内 UI 拷样式 ∥ Worker Access | 合入前约定 `/api/me` 契约 |
| S5 M5 Groups ∥ M4 AI | 共享 WL 不冲突时可并行，仍建议串行减冲突 |
| **不可** 跳过 S3 做 S5 | 门禁后置成本高 |
| **不可** 跳过 S4 做 M2 items | schema 先落地 |

---

## 与设计文档映射

| 阶段 | 主要依据 |
|------|----------|
| S1 | [02](02-architecture.md) monorepo |
| S2 | [02](02-architecture.md) Access；[04](04-features.md) 导航视觉 |
| S3 | [06](06-testing-6dq.md)（L3 延后） |
| S4 | [03](03-data-model-and-ingest.md) schema；[05](05-migration.md) |
| S5 | [03](03)[04](04) 全功能；L3 补齐 [06](06) |

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| main 上 S1 后 prod 不可用 | README 标明；DNS 仍指旧 Railway 直至 M8；或维护窗口 |
| Access 本地难调 | `AUTH_DEV_BYPASS` + 文档；L2 专用 |
| legacy/v1 体积大 | 仅 git mv，不复制 blob 双份 |
| E2E 不稳定 | S5 才加；单 worker + isolated D1 persist |
| 钩子过慢 | pre-commit 只 L1/G1；L2 放 pre-push |

---

## 下一步

执行顺序固定：**S1 → S2 → S3 → S4 → S5**。  
确认本方案后从 **S1.1** 开工。
