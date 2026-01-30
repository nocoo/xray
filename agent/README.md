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

## 当前原子能力清单

### 抓取类
- `agent/fetch/single.ts`：单用户最近 N 小时
- `agent/fetch/incremental.ts`：watchlist 批量增量抓取

### 搜索类
- `agent/research/search-user-tweets.ts`：用户 + 关键词搜索
- `agent/research/track-topic-trends.ts`：话题搜索 + 历史对比
- `agent/research/search-*.ts`：固定主题搜索（后续会收敛成统一入口）

### 分析类
- `agent/research/viral-tweet-analyzer.ts`：爆款特征分析
- `agent/research/sentiment-analysis.ts`：情绪分析
- `agent/research/find-influencers.ts`：影响者筛选
- `agent/research/competitor-watch.ts`：竞品监控
- `agent/analyze/recent.ts`：DB 最近未处理

### 调试类
- `agent/research/demo.ts`
- `agent/research/check-never-users.ts`
- `agent/research/fetch-history.ts`

## 统一输出规范（规划）

所有原子操作应输出：
```json
{
  "generated_at": "2026-01-30T10:00:00.000Z",
  "query": { "topic": "AI", "count": 20 },
  "tweets": [],
  "summary": { "total": 0 }
}
```

输出路径：
- `data/agent/<op>_YYYYMMDDHHMMSS.json`

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

## 接下来要做（迭代）

1) 把 `search-*.ts` 收敛成通用 `search-topic.ts`
2) 将分析脚本改造成“输入 tweets → 输出分析”的纯函数风格
3) 增加 JSON schema 校验与批量组合执行器
