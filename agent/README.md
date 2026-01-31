# Agent 脚本能力地图（原子化 & 可组合）

目标：让独立 agent 通过 `agent/` 下的脚本完成“原子操作”，并可组合成强大的 X 探索工作流。

## 最终效果（愿景）

1) **原子操作可复用**
- 每个脚本只做一件事：抓取/搜索/分析/汇总
- 输出统一 JSON，方便组合与复用

2) **可组合工作流**
- 任何人都可以用 2-4 个脚本组合出强能力（趋势追踪、竞品监控、爆款洞察、影响者发现）

3) **输出一致可审计**
- 所有结果写入 `data/agent/`
- 文件名包含时间戳，便于追踪与对比

4) **稳定且可测试**
- 单元测试覆盖关键路径
- 输出格式可被验证脚本检查

## 统一输出

多数脚本会将结果写入 `data/agent/`，文件名带时间戳。
支持 `--out` 的脚本可指定输出路径。

输出结构示例：
```json
{
  "generated_at": "2026-01-30T10:00:00.000Z",
  "query": {},
  "tweets": [],
  "summary": {}
}
```

输出路径：
- `data/agent/<op>_YYYYMMDDHHMMSS.json`

## 当前原子能力清单

### 抓取类
- `agent/fetch/single.ts`：单用户最近 N 小时
- `agent/fetch/incremental.ts`：watchlist 批量增量抓取

### 搜索类
- `agent/research/search-user-tweets.ts`：用户 + 关键词搜索
- `agent/research/track-topic-trends.ts`：话题搜索 + 历史对比
- `agent/research/search-fed-candidates.ts`：固定主题搜索（联储候选相关）
- `agent/research/search-trump-fed-gold.ts`：固定主题搜索（Trump/Fed/Gold 相关）
- `agent/research/search-microsoft.ts`：固定主题搜索（Microsoft 相关）

### 分析类
- `agent/research/viral-tweet-analyzer.ts`：爆款特征分析
- `agent/research/sentiment-analysis.ts`：情绪分析
- `agent/research/find-influencers.ts`：影响者筛选
- `agent/research/competitor-watch.ts`：竞品监控
- `agent/analyze/recent.ts`：DB 最近未处理

### 调试/探索类
- `agent/research/demo.ts`
- `agent/research/check-never-users.ts`
- `agent/research/fetch-history.ts`

### 工作流类
- `agent/index.ts`：简化工作流（抓取→分析→报告），输出 JSON
- `agent/workflow/hourly.ts`：小时级工作流（抓取→AI 分析→报告→Obsidian/Slack），输出 JSON

## 参数说明

### agent/fetch/single.ts
参数：
- `--user`：用户名（带或不带 @）
- `--hours`：回溯小时数
- `--skip-processed`：是否跳过已处理推文

### agent/fetch/incremental.ts
参数：
- `--hours`：回溯小时数
- `--batch`：批处理大小
- `--delay`：批次间延迟（ms）
- `--skip-processed`：是否跳过已处理推文

### agent/research/search-user-tweets.ts
参数：
- `--user` / `-u`：用户名
- `--words` / `-w`：关键词
- `--count` / `-c`：返回数量
- `--sort` / `-s`：是否按互动排序（true=Top，false=Recent）
- `--out` / `-o`：输出 JSON 路径（可选）

### agent/research/track-topic-trends.ts
参数：
- `--topic` / `-t`：话题关键词
- `--compare` / `-c`：是否对比历史
- `--count` / `-n`：抓取数量
- `--save` / `-s`：是否保存历史
- `--out` / `-o`：输出 JSON 路径（可选）

### agent/research/search-fed-candidates.ts
无参数（固定主题）。

### agent/research/search-trump-fed-gold.ts
无参数（固定主题）。

### agent/research/search-microsoft.ts
无参数（固定主题）。

### agent/research/viral-tweet-analyzer.ts
参数：
- `--topic` / `-t`
- `--count` / `-c`
- `--out` / `-o`

### agent/research/sentiment-analysis.ts
参数：
- `--topic` / `-t`
- `--count` / `-c`
- `--out` / `-o`

### agent/research/find-influencers.ts
参数：
- `--topic` / `-t`
- `--count` / `-c`
- `--min-followers` / `-m`
- `--out` / `-o`

### agent/research/competitor-watch.ts
参数：
- `--accounts` / `-a`
- `--hours` / `-h`
- `--out` / `-o`

### agent/research/demo.ts
无参数（固定账号集合）。

### agent/research/check-never-users.ts
无参数（固定账号集合）。

### agent/research/fetch-history.ts
无参数（固定账号集合）。

### agent/index.ts
参数：
- `--mode`：`hourly | fetch | analyze`

### agent/workflow/hourly.ts
参数：
- `--dry-run`：只跑分析与输出，不写 Obsidian/Slack

## 组合示例（未来能力）

1) **竞品情报**
- `search-user-tweets` → `competitor-watch` → `viral-tweet-analyzer`

2) **话题趋势**
- `track-topic-trends` → `find-influencers`

3) **爆款洞察**
- `search-topic` → `viral-tweet-analyzer`

4) **影响者发现**
- `search-topic` → `find-influencers`

## 当前调整方向（实施中）

1) **统一配置入口**
- 所有脚本通过 `agent/lib/agent-api.ts` 读取 API key/cookie

2) **统一输出工具**
- `agent/lib/agent-output.ts` 提供输出路径与写入能力

3) **路径规范化**
- 统一输出到 `data/agent/`

## 注意事项

- `config/` 与 `data/` 为敏感目录，禁止提交
