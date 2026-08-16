# 07 — Implementation Plan（执行细化）

**分支：`main`（D8）。** 原子 commit；S3 后强制 hooks + **mandatory CI**。  
决策：[08](08-open-questions.md)。Codex review 修复项已并入 02–06。

---

## 进度（2026-08-12）

| 项 | 状态 |
|----|------|
| MVVM (`packages/ui/src/viewmodels/*`) | **done** |
| L1 coverage ≥95% lines/funcs/**branches** (denom: worker lib+middleware+repos+routes; View exempt) | **done** (`bash scripts/check-coverage.sh 95 95 95`) |
| L2 real-HTTP + route gate (all `/api/*`) | **done** (`bun run test:l2`) |
| D1 isolation (`env.test` / `xray-db-test` / `state-l2`) | **done** |
| L3 main flows (`e2e/*.pw.ts`) | **done** (local UI+worker) |
| Husky 6DQ pre-commit L1+G1 / pre-push L2+G2 | **done** |

## 进度（2026-08-11）

| 阶段 | 状态 | 说明 |
|------|------|------|
| **S1** | **完成** | v1 归档 + monorepo + `/api/live` + UI 可启动 |
| **S2** | **完成** | Access/bypass + users + `/api/me` + SessionGate + mock 页 + card shells |
| **S3** | **完成** | L1/G1 hooks、L2 skeleton + coverage gate、GHA CI、RL stub |
| **S4** | **完成（主路径）** | 全 schema + repos/API + UI 真名单；migrate 脚本按 v1 schema 可 dry-run/apply |
| **S5** | **完成** | M0–M8：AI/translate、zhe.to、dashboard、Groups/Settings UI、Playwright L3 骨架、release 2.0.0 |

### S4 已落地

| 项 | 位置 |
|----|------|
| `0001_full_schema.sql` | watchlists/members/tags/groups/items/push_tokens/settings/ai_configs/… |
| Repos + unit tests | `packages/worker/src/repos/*` |
| CRUD APIs | `/api/watchlists`, members, tags, groups, settings |
| UI 真数据 | Watchlists / Detail / Groups / Tokens 调 Worker |
| migrate script | `bun run migrate:v1 -- --sqlite … --dry-run` |

### S5 已落地（MVP 路径）

| 项 | 位置 |
|----|------|
| Push tokens mint/list/revoke | `/api/push-tokens` + UI |
| Ingest push + Bearer | `POST /api/v1/ingest/push`（ingest host） |
| Timeline items list | `GET /api/watchlists/:id/items` + source_type filter |
| source_type chips | shared + UI |

**S5 出口已满足**：AI KEK + translate batch、zhe.to save、dashboard 真聚合、Groups/Settings UI、L3 smoke 文件、版本 2.0.0。

### Post-S5 产品缺口（04）— **done**

| # | 能力 | 关键路径 | 状态 |
|---|------|----------|------|
| P1 | Twitter export parse + Groups bulk import | `packages/shared/src/twitter-export.ts`; `POST /api/groups/:id/members/import`; `groups-page.tsx` | **done** |
| P2 | Group → watchlist member copy | `POST /api/groups/:id/copy-to-watchlist`; `repos/groups.ts` `copyGroupMembersToWatchlist` | **done** |
| P3 | Ingest logs list + dashboard recent | `GET /api/watchlists/:id/ingest-logs`; `repos/ingest-logs.ts`; dashboard `recentIngestLogs` | **done** |
| P4 | AI test connection + summary fill | `POST /api/ai-config/test`; `repos/translate.ts` summary path; `ai-settings-page.tsx` | **done** |
| P5 | Custom card zhe.to Save + member tags | `custom-item-card.tsx`, `lib/zheto-save.ts`; tags on add + edit (`edit-member-dialog`) | **done** |

**Route harness (L2):** `packages/worker/src/routes/product-gaps-routes.test.ts` + `ai-test.test.ts` — each of import / copy-to-watchlist / ingest-logs / ai-config/test covers **401**, happy JSON shape, and failure (bad body or cross-user 404); AI test mocks `fetch` for `{ok:true}` and upstream non-OK `{ok:false}`.

### Local producer（09）— **done**

| 项 | 位置 |
|----|------|
| `bun run refresh:watchlists` | `scripts/refresh-watchlists.ts` |
| twitter-cli boundary | `packages/shared/src/x-timeline-source.ts`, `twitter-cli-source.ts`, `producer-*` |

### 相关 commit（实现段摘录）

```
feat(worker): d1 full schema …
feat(worker): watchlists groups items tokens push …
feat(ui): wire real watchlist group token apis …
feat(shared): twitter export member import parse
feat: group bulk import and copy to watchlist
feat: ingest logs list and dashboard recent
feat: ai test connection and summary fill
feat(ui): custom zheto save and member tags
```

**当前停点**：S5 + 产品缺口 P1–P5 + local producer + **S6** 已完成。  
**2026-08-16**：XR-29 / BD-10 已落地（token = ingest 认证，读图+写 push）。发版 **2.1.6**。

---

## 总览 S1–S5

| 阶段 | 目标 | 出口 | 状态 |
|------|------|------|------|
| **S1** | v1→`legacy/v1/` + monorepo 骨架 | live + 空 UI | **done** |
| **S2** | Access + sidebar + mock 页 + **最小 users 表** | 可登录浏览 mock | **done** |
| **S3** | L1/G1 pre-commit；L2/G2 pre-push；**CI required** | hook+CI 绿（无 L3） | **done** |
| **S4** | 全 schema + 迁移 WL/Groups | 真名单、空 items | **done** |
| **S5** | 模块 + 递增 E2E → 2.0.0 | 全功能 + L3 on-demand | **done** |

```
S1 ✓ → S2 ✓ → S3 ✓ → S4 ✓ → S5(主路径✓ / L3+AI 加深)
```

---

## S1 — 存档 + 新结构

| # | 内容 | 状态 |
|---|------|------|
| S1.1–S1.6 | legacy/v1、workspaces、shared/ui/worker、README | **done** |

---

## S2 — 可登录架子 + Mock 页

| # | Commit | 状态 |
|---|--------|------|
| S2.1–S2.9 | palette / shell / auth / me / mocks / cards | **done** |

**出口**：bypass 登录；users 行存在于 local D1 — **已满足**。

---

## S3 — 6DQ 自动化（无 E2E）+ CI 必选

| # | 内容 | 状态 |
|---|------|------|
| S3.1–S3.10 | unit / coverage / husky / GHA / RL stub | **done** |

---

## S4 — 全 Schema + 迁移

| # | 内容 | 状态 |
|---|------|------|
| S4.1 | `0001_full_schema.sql` | **done** |
| S4.2 | `normalizeHandle` + SOURCE_TYPES | **done** |
| S4.3–S4.4 | watchlists / members / tags repos+routes | **done** |
| S4.5 | groups repos+routes | **done** |
| S4.6 | items list + settings | **done** |
| S4.7 | `scripts/migrate-v1-to-d1.ts` | **partial** (required tables/owner/KEK/spawn; L2 migrate e2e still thin) |
| S4.8 | UI 接真 API | **done** |

**出口**：真名单、空 items — **已满足**。

---

## S5 — 模块 + 递增 E2E

| # | 内容 | 状态 |
|---|------|------|
| M0 | Watchlist CRUD | **done** |
| M0.5 | Settings windowHours | **done**（API + UI） |
| M1 | Items timeline + source filter | **done**（+ Translate 按钮） |
| M2 | Groups CRUD | **done**（UI rename/delete/members） |
| M3 | Push tokens | **done** |
| M4 | Ingest push canonical | **done** |
| M5 | AI settings / translate batch | **done**（+ test connection + summary fill） |
| M6 | zhe.to save | **done**（tweet + custom card） |
| M7 | Dashboard real aggregates | **done**（+ recent ingest_logs） |
| M8 | Playwright L3 + release 2.0.0 | **done**（`e2e/*.pw.ts` + `test:l3`；需本机 UI/worker 才绿；version 2.0.0 已对齐，无 in-repo release 脚本故未切 tag） |
| M2+ | Groups bulk import + copy → WL | **done**（见 Post-S5 P1–P2） |
| M1+ | WL detail ingest logs + member tags | **done**（见 Post-S5 P3/P5） |

---

## 提交纪律

1. main only；atomic conventional commits。  
2. 不 `git add -A`。  
3. S3 后每 commit 过 pre-commit；push 过 pre-push + CI。  
4. S5 模块附带 e2e 增量。  

## S6 — Ingest graph + token read/write（**done**，2.1.6）

| # | 内容 | 状态 |
|---|------|------|
| S6.1 | `isIngestAllowedPath` 放行 `GET /api/v1/ingest/graph` | **done** |
| S6.2 | 抽出 `pushTokenAuth`；graph 要 `ingest:read`，push 要 `ingest:push`；**graph 也走 ingest RL（key=token_id）**，429 可测 | **done** |
| S6.3 | mint 默认 scopes `["ingest:read","ingest:push"]`；旧仅 push 的 token **不**隐式获读，须重 mint | **done** |
| S6.4 | `GET /api/v1/ingest/graph` 返回 owner 的 WL + x.com members（`parseMembersGraph` 形）；**空租户 200 `{watchlists:[]}`**；parser 必须接受空数组 | **done** |
| S6.5 | **每次** `refresh:watchlists` 开始（含 `--dry-run` / `--cache-only` / `--from-cache`）先用同一 token+ingest base **live GET graph**。401/403/429/网络/坏 JSON **fail closed**，不得回退 snapshot/cache。live 成功后，**仅命令行显式 `--members-file` 且文件存在**才覆盖。删除默认 `config/members.json`、`XRAY_MEMBERS_FILE`、`XRAY_BROWSER_BASE`、`XRAY_CF_AUTHORIZATION`。`--env prod\|dev` 可选，`--env dev` 必须打 `127.0.0.1:8787` 且 Host 走 ingest/local 允许路径 | **done** |
| S6.6 | L1+L2：graph 200/401/403/429；host 矩阵；租户只见自己的图；`gate:routes` 含新路径。负矩阵：push-only→graph 403 且 push 仍可用；read-only→graph 200 且 push 403；revoked/坏 token→401；ingest Bearer 不能打 token CRUD/Groups/AI/settings/SPA；browser host 不接受 Bearer agent 路由 | **done** |
| S6.7 | **脚本级测试**（shipped `refresh-watchlists` / 其抽取出的 graph-load）：所有运行模式都先 live 拉图；显式 `--members-file` 覆盖顺序；文件不存在不覆盖；live 失败不回退；graph 与 push 用同一解析后的 token/base | **done** |

**出口**：同一 `XRAY_PUSH_TOKEN` + `XRAY_INGEST_BASE` 可在 prod 或 local 跑 `bun run refresh:watchlists --`，无需 `members.json` / Access cookie。每次启动都 live 拉图。

---

## 下一步（可选加深 — 非产品缺口）

1. 本地起 UI+worker 后跑 `bun run test:l3`；可选 CI 挂 L3  
2. 生产 Access 浏览器登录 smoke + 真 push  
3. `bun run release`（`scripts/release.ts`）发 GitHub tag + release；Worker `bun run deploy`  

4. 加深 migrate L2 e2e（S4.7 still thin）  
5. KEK read-repair write-back + `scripts/reencrypt-secrets.ts`  
6. Ingest CF RL 生产验证 / 硬化  
7. 真 multi-provider AI（gecko 级）— 非 MVP  
8. custom / hermes 专用 producer — push 契约已有，脚本未单独做  

