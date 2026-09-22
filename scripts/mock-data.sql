INSERT OR IGNORE INTO users (id, access_iss, access_sub, email, name, created_at_ms)
VALUES ('xray-mock-user', 'https://dev.xray.local', 'dev-bypass-sub', 'dev@xray.local', 'Mock User', unixepoch() * 1000);

INSERT OR IGNORE INTO watchlists (id, user_id, name, description, icon, translate_enabled, created_at_ms)
VALUES
  (1, 'xray-mock-user', 'AI & Engineering', 'Mock feed: agents, tools and software engineering.', 'sparkles', 1, unixepoch() * 1000),
  (2, 'xray-mock-user', 'Design & Reading', 'Mock feed: interface design and independent writing.', 'book-open', 0, unixepoch() * 1000);

INSERT OR IGNORE INTO watchlist_members (id, user_id, watchlist_id, source_type, handle, display_name, note, added_at_ms)
VALUES
  (1, 'xray-mock-user', 1, 'x.com', 'demo_builder', 'Demo Builder', 'Fictional account for local preview', unixepoch() * 1000),
  (2, 'xray-mock-user', 1, 'custom', 'engineering-notes', 'Engineering Notes', 'Sample custom source', unixepoch() * 1000),
  (3, 'xray-mock-user', 2, 'x.com', 'demo_designer', 'Demo Designer', 'Fictional account for local preview', unixepoch() * 1000),
  (4, 'xray-mock-user', 2, 'custom', 'reading-room', 'Reading Room', 'Sample custom source', unixepoch() * 1000);

INSERT OR IGNORE INTO tags (id, user_id, name, color)
VALUES (1, 'xray-mock-user', 'Engineering', '#6366f1'), (2, 'xray-mock-user', 'Design', '#10b981');
INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id)
VALUES (1, 1), (2, 1), (3, 2), (4, 2);

INSERT OR IGNORE INTO groups (id, user_id, name, description, icon, created_at_ms)
VALUES (1, 'xray-mock-user', 'Builders', 'Sample accounts to copy into a watchlist.', 'users', unixepoch() * 1000);
INSERT OR IGNORE INTO group_members (id, user_id, group_id, source_type, handle, display_name, added_at_ms)
VALUES
  (1, 'xray-mock-user', 1, 'x.com', 'demo_builder', 'Demo Builder', unixepoch() * 1000),
  (2, 'xray-mock-user', 1, 'x.com', 'demo_designer', 'Demo Designer', unixepoch() * 1000);

WITH RECURSIVE samples(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM samples WHERE n < 27),
posts AS (
  SELECT n, (n % 4) + 1 AS member_id,
    CASE n % 4
      WHEN 0 THEN 'A small tool that does one thing well is easier to trust. Today we replaced a background workflow with a single explicit action and a clear progress indicator.'
      WHEN 1 THEN 'Engineering notes: make state transitions visible, keep retries bounded, and measure the failure path as carefully as the happy path.'
      WHEN 2 THEN 'Design study: a compact header can hold navigation, context and a data-source switch without taking space away from the content.'
      ELSE 'Reading room: save the original source, add a short note about why it matters, and revisit it when the next project needs the idea.'
    END AS text,
    (unixepoch() - n * 18000) * 1000 AS created_at_ms
  FROM samples
)
INSERT OR IGNORE INTO items (id, user_id, watchlist_id, source_type, external_id, member_id,
  author_username, title, text, created_at_ms, ingested_at_ms, payload_json, ai_status, translated_text)
SELECT 1 + p.n, 'xray-mock-user', m.watchlist_id, m.source_type, 'mock-post-' || p.n, m.id,
  m.handle, CASE WHEN m.source_type = 'custom' THEN m.display_name || ' · Note ' || (p.n + 1) END,
  p.text, p.created_at_ms, p.created_at_ms,
  json_object('author', json_object('username', m.handle, 'display_name', m.display_name),
    'body', json_object('tweet', json_object('text', p.text,
      'public_metrics', json_object('like_count', 12 + p.n * 7, 'retweet_count', 2 + p.n)))),
  CASE WHEN p.n % 4 = 0 THEN 'succeeded' ELSE 'not_requested' END,
  CASE WHEN p.n % 4 = 0 THEN '一个专注做好一件事的小工具更容易让人信任。今天我们用一次明确的操作和清晰的进度提示，替换了一段后台工作流。' END
FROM posts p JOIN watchlist_members m ON m.id = p.member_id;

WITH RECURSIVE days(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM days WHERE n < 6)
INSERT OR IGNORE INTO ingest_logs (id, user_id, watchlist_id, attempted, accepted, deduped, rejected, created_at_ms)
SELECT n + 1, 'xray-mock-user', (n % 2) + 1, 6, 4, 2, 0, (unixepoch() - n * 86400) * 1000 FROM days;

INSERT OR IGNORE INTO channels (id, user_id, name, description, created_at_ms)
VALUES
  (1, 'xray-mock-user', '研发日报', 'Mock reports for Chinese typography and Markdown reading.', unixepoch() * 1000),
  (2, 'xray-mock-user', '每周观察', 'Sample weekly research notes.', unixepoch() * 1000);

INSERT OR IGNORE INTO push_tokens
  (id, user_id, token_prefix, token_hash, label, scopes, created_at_ms, revoked_at_ms, channel_id)
VALUES (900001, 'xray-mock-user', 'mock_source',
  '0000000000000000000000000000000000000000000000000000000000000000',
  'Mock Research Agent', '["articles:write"]', unixepoch() * 1000, unixepoch() * 1000, 1),
  (900002, 'xray-mock-user', 'mock_weekly',
  '1111111111111111111111111111111111111111111111111111111111111111',
  'Mock Research Agent', '["articles:write"]', unixepoch() * 1000, unixepoch() * 1000, 2);

WITH RECURSIVE reports(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM reports WHERE n < 6)
INSERT OR IGNORE INTO channel_articles
  (id, user_id, channel_id, external_id, title, report_date, summary, author, markdown,
    source_key_id, source_label, created_at_ms)
SELECT n + 1, 'xray-mock-user', CASE WHEN n = 6 THEN 2 ELSE 1 END, 'mock-report-' || n,
  CASE WHEN n = 6 THEN '本周观察：让阅读回到内容本身' ELSE '研发日报 · ' || date('now', '-' || n || ' days') END,
  date('now', '-' || n || ' days'),
  '从小工具、清晰的界面与稳定的阅读体验，记录今天值得保留的进展。示例内容，非实际报告。',
  'Xray Research',
  '## 今日进展

这是一篇用于本地预览的示例报告。我们把分散在不同工具中的观察，汇集到一个可以安静阅读的地方。每篇文章保留自己的报告日期和投递来源，方便回看，也方便比较前后的变化。

中文阅读需要合适的行宽和行距。正文采用仓耳今楷，English text uses Charter，让中英文混排保持自然。导航和操作按钮使用清晰的无衬线字体，帮助你快速找到下一篇文章。

### 已完成

- 将日报整理成 Markdown，保留标题、段落与来源链接。
- 为每个生产者配置独立的 Key，并明确它可以投递的频道。
- 在列表中按报告日期排列内容，让补交的旧报告回到正确的位置。

| 观察维度 | 今天的进展 | 下一步 |
| --- | --- | --- |
| 内容组织 | 报告集中在频道中 | 持续积累 |
| 阅读体验 | 支持中文长文与表格 | 留意窄屏表现 |
| 投递可靠性 | 使用稳定编号去重 | 检查失败重试 |

## 一点思考

> 好的工具应该让你更容易接近内容。一次打开，一次阅读，留下真正有用的信息。

日报的价值并不在于写得多，而在于准确记录变化。昨天的问题今天是否有了答案，下一步准备验证什么，这些具体的事实往往比漂亮的总结更有帮助。

![阅读与写作的桌面](https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80)

图片通过外链加载，Xray 只保存这段 Markdown 文本。即使外部图片不可用，文章里的文字、列表和表格仍然可以阅读。

### 投递示例

```json
{
  "external_id": "daily-2026-09-22",
  "title": "研发日报",
  "report_date": "2026-09-22",
  "markdown": "## 今日进展\n\n记录具体的变化。"
}
```

## 明日计划

- [x] 整理今天的观察
- [ ] 回看昨天留下的问题
- [ ] 为下一次实验补充证据

继续保持短而清楚的记录。需要更多细节时，在原始文章中展开；阅读列表只保留标题、日期和摘要，让每天的内容更容易找到。',
  CASE WHEN n = 6 THEN 900002 ELSE 900001 END, 'Mock Research Agent', (unixepoch() - n * 86400) * 1000
FROM reports;

INSERT OR IGNORE INTO channels (id, user_id, name, description, created_at_ms, sort_order)
VALUES
  (910101, 'xray-mock-user', '产品设计观察', 'Mock · 短篇观察、设计系统与公开资料。', unixepoch() * 1000, 2),
  (910102, 'xray-mock-user', '无标签快讯', 'Mock · 不关联任何频道或来源标签的短报告。', unixepoch() * 1000, 3),
  (910103, 'xray-mock-user', '灵感备忘', 'Mock · 捕捉尚未成形的想法与小实验。', unixepoch() * 1000, 4);

INSERT OR IGNORE INTO tags (user_id, name, color)
VALUES
  ('xray-mock-user', '研发', '#6366f1'),
  ('xray-mock-user', '开源', '#10b981'),
  ('xray-mock-user', 'Cloudflare', '#f59e0b'),
  ('xray-mock-user', '产品设计', '#ec4899'),
  ('xray-mock-user', '深度阅读', '#8b5cf6'),
  ('xray-mock-user', 'AI Agents', '#6366f1'),
  ('xray-mock-user', 'TypeScript', '#6366f1'),
  ('xray-mock-user', 'React', '#6366f1'),
  ('xray-mock-user', 'Accessibility', '#6366f1'),
  ('xray-mock-user', '待验证', '#6366f1'),
  ('xray-mock-user', '已归档', '#6366f1'),
  ('xray-mock-user', '阅读清单', '#6366f1'),
  ('xray-mock-user', '每周观察', '#6366f1'),
  ('xray-mock-user', '性能优化', '#6366f1'),
  ('xray-mock-user', 'Release notes', '#6366f1'),
  ('xray-mock-user', 'Research & Development', '#6366f1'),
  ('xray-mock-user', '日本語の資料', '#6366f1'),
  ('xray-mock-user', '长期研究计划与跨团队设计系统实践记录', '#6366f1'),
  ('xray-mock-user', 'a-very-long-unbroken-tag-name-for-small-screen-layout-review', '#6366f1');

WITH demo_keys(id, channel_id, channel_name, prefix, label, age_days, last_used_days, revoked_days) AS (
  VALUES
    (910101, 1, '研发日报', 'mock_rd_daily', '研发日报 · 每日采集', 14, 0, NULL),
    (910102, 1, '研发日报', 'mock_rd_weekly', '开源周报 · 资料整理', 10, 2, NULL),
    (910103, 1, '研发日报', 'mock_rd_idle', '临时研究员 · 尚未投递', 3, NULL, NULL),
    (910104, 1, '研发日报', 'mock_rd_retired', '旧版采集器 · 已撤销', 30, 8, 7),
    (910105, 910101, '产品设计观察', 'mock_design', '设计观察 · 公开资料', 8, 1, NULL),
    (910106, 910102, '无标签快讯', 'mock_plain', '快讯来源 · 无标签', 2, 0, NULL)
)
INSERT OR IGNORE INTO push_tokens
  (id, user_id, channel_id, token_prefix, token_hash, label, scopes, created_at_ms, last_used_at_ms, revoked_at_ms)
SELECT k.id, c.user_id, c.id, k.prefix, 'mock-only:not-a-sha256:' || k.id,
  k.label, '["articles:write"]', (unixepoch() - k.age_days * 86400) * 1000,
  CASE WHEN k.last_used_days IS NOT NULL THEN (unixepoch() - k.last_used_days * 86400) * 1000 END,
  CASE WHEN k.revoked_days IS NOT NULL THEN (unixepoch() - k.revoked_days * 86400) * 1000 END
FROM demo_keys k JOIN channels c ON c.id = k.channel_id AND c.name = k.channel_name
WHERE c.user_id = 'xray-mock-user';

WITH associations(channel_id, channel_name, tag_name) AS (
  VALUES (1, '研发日报', '研发'), (1, '研发日报', '开源'),
    (910101, '产品设计观察', '产品设计')
)
INSERT OR IGNORE INTO channel_tags (channel_id, tag_id)
SELECT c.id, t.id FROM associations a
JOIN channels c ON c.id = a.channel_id AND c.name = a.channel_name AND c.user_id = 'xray-mock-user'
JOIN tags t ON t.name = a.tag_name AND t.user_id = c.user_id;

WITH associations(key_id, tag_name) AS (
  VALUES (910101, '研发'), (910101, 'Cloudflare'), (910101, '深度阅读'),
    (910102, '开源'), (910102, '深度阅读'),
    (910104, '研发'), (910105, '产品设计'), (910105, '开源')
)
INSERT OR IGNORE INTO channel_key_tags (key_id, tag_id)
SELECT k.id, t.id FROM associations a
JOIN push_tokens k ON k.id = a.key_id AND k.token_hash = 'mock-only:not-a-sha256:' || a.key_id
JOIN tags t ON t.name = a.tag_name AND t.user_id = k.user_id
WHERE k.user_id = 'xray-mock-user';

WITH demo_reports(id, key_id, external_id, title, age_days, summary, markdown) AS (
  VALUES
  (910101, 910101, 'mock-reader-showcase-v1', '研发手记：从开源工具到稳定的日常工作流', 0,
    '一篇完整的中文阅读样本：公开来源预览、去重后的频道与来源标签、表格、任务清单、代码和外链图片。',
    '## 今天值得打开的三个页面

这份手记整理了三个可以直接访问的公开资料。先看工具的使用方式，再看界面的组织方式，最后把运行环境的约束放回实际工作中。这是一份 Mock 演示报告，不代表项目的真实评测结论。

- [Kami：一个轻量的阅读入口](https://github.com/tw93/Kami)
- [Basalt：应用界面组件与设计约定](https://github.com/nocoo/basalt)
- [Cloudflare Workers：运行时与开发文档](https://developers.cloudflare.com/workers/)

### 先保留问题，再收集答案

工具多了以后，真正耗费精力的往往不是打开页面，而是在页面之间重新建立上下文。上午看到的一段实现，下午遇到的一次边界条件，到了晚上写总结时，常常只剩下模糊的印象。把来源和自己的判断分开记录，能让第二次阅读轻松不少。

这份报告采用了两个层级：正文留下完整推理，相关链接保留继续阅读的入口。即使某个站点暂时不允许获取预览，原始链接仍然可以打开。资料不会因为缺少一张封面图或一段摘要而失去价值。

## 三个方向的阅读顺序

| 资料 | 先看什么 | 可以带走的问题 |
| --- | --- | --- |
| Kami | 阅读入口与信息组织 | 一次阅读需要多少操作？ |
| Basalt | 布局、表单与弹窗约定 | 相同操作是否保持一致？ |
| Workers | 请求生命周期与运行限制 | 失败后如何恢复，边界在哪里？ |

表格适合横向比较，段落适合解释取舍。阅读时不必把所有信息挤成一张表：先用一小段话交代背景，再用表格收束几个可以比较的维度，回看时就有了明确的落点。

### 界面观察

浅色内容区需要有层次。正文是注意力的中心，相关资料放在更安静的侧栏；按钮和标签应当帮助识别信息，而不是争夺整页的视觉重心。窄屏里可以把补充资料收进抽屉，但正文中的来源链接仍然保留。

中文与 English 混排时，标题、标点和代码之间的节奏同样重要。一个特别长的名字，例如 `daily-research-collector-with-a-deliberately-long-producer-name`，也不应该把阅读列撑出屏幕。

![供阅读与记录使用的桌面](https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80)

## 用小样本验证流程

下面的代码只展示普通的本地数据结构，不包含任何凭据，也不会发起请求。

```ts
const readingQueue = [
  { name: "Kami", status: "read" },
  { name: "Basalt", status: "review" },
  { name: "Workers", status: "next" },
];

const next = readingQueue.filter((entry) => entry.status !== "read");
console.log(next.map((entry) => entry.name));
```

- [x] 保留三个公开资料的原始链接
- [x] 用频道标签和来源标签共同描述文章
- [x] 确认重复的「研发」标签只展示一次
- [ ] 回看窄屏中的表格和代码块
- [ ] 在外部预览不可用时继续打开原始页面

## 当资料暂时不可用

这个[不存在的公开页面](https://example.com/xray-mock-preview-unavailable-v1)专门用于展示预览失败时的降级状态。失败应该停留在这一张卡片上，不应阻塞其他来源，也不应让已经可读的正文消失。

> 可以失败的是补充信息的获取，不应该失去的是已经保存的内容。

## 留给明天的记录

今天先把三份资料放进同一个阅读上下文。明天再回看时，只需判断它们是否帮助回答了具体的问题：阅读入口是否清晰，界面操作是否一致，运行约束是否写进了设计。

没有结论的地方就保留问题。对于还没有验证的细节，不急着把猜测写成事实；把观察和证据放在一起，下一次修改才有可以依赖的起点。

参考链接也可以写成 [Workers 文档][workers]，它与上面的直接链接指向同一个来源，用来验证列表中的去重。

[workers]: https://developers.cloudflare.com/workers/
'),
  (910102, 910102, 'mock-reference-notes-v1', '开源阅读补记：引用链接与代码边界', 1,
    '较短的引用式 Markdown 样本，来源标签与频道标签包含重复项。',
    '## 两条阅读笔记

今天只记录两件事：先读 [Kami][kami] 的项目说明，再回到 [Basalt][basalt] 查找界面约定。

- [x] 收集来源
- [ ] 写下自己的理解

```text
https://example.com/inside-code-is-not-a-source
```

代码块里的地址只是示例文本，不应出现在相关链接中。

[kami]: https://github.com/tw93/Kami
[basalt]: https://github.com/nocoo/basalt
'),
  (910103, 910105, 'mock-design-short-v1', '设计观察：把次要内容放回次要位置', 0,
    '一句结论、一份公开来源，适合检验短篇正文与侧栏的比例。',
    '## 一个小调整

正文保持明亮，补充资料使用中性的次级表面。重点不在于增加装饰，而在于让读者自然分辨主次。

继续阅读：[Basalt 组件库](https://github.com/nocoo/basalt)。
'),
  (910104, 910106, 'mock-plain-short-v1', '午间快讯：今天先做好一件小事', 0,
    '无标签、无图片、无外部链接的最短阅读场景。',
    '今天把一个重复操作合并成了一次明确的动作。

没有更多附件，也没有补充链接。记录到这里就足够了。
'),
  (910105, 910104, 'mock-revoked-source-v1', '历史记录：来源撤销后仍然保留的报告', 8,
    '来源 token 已撤销，既有文章与来源名称仍可阅读。',
    '## 历史记录

这篇 Mock 报告来自已经撤销的旧版采集器。撤销停止新的投递，已有内容继续保留。

| 状态 | 结果 |
| --- | --- |
| 旧 token | 已撤销 |
| 既有报告 | 可继续阅读 |
')
)
INSERT OR IGNORE INTO channel_articles
  (id, user_id, channel_id, external_id, title, report_date, summary, author, markdown,
    source_key_id, source_label, created_at_ms)
SELECT r.id, k.user_id, k.channel_id, r.external_id, r.title,
  date('now', '-' || r.age_days || ' days'), r.summary, 'Mock Research Desk', r.markdown,
  k.id, k.label, (unixepoch() - r.age_days * 86400) * 1000
FROM demo_reports r JOIN push_tokens k
  ON k.id = r.key_id AND k.token_hash = 'mock-only:not-a-sha256:' || r.key_id
WHERE k.user_id = 'xray-mock-user';

UPDATE channels SET name = '灵感备忘', description = 'Mock · 捕捉尚未成形的想法与小实验。'
WHERE id = 910103 AND user_id = 'xray-mock-user' AND name = '等待第一篇报告'
  AND description = 'Mock · 空频道，展示首次投递前的状态。';

INSERT OR IGNORE INTO channels (id, user_id, name, description, created_at_ms, sort_order)
VALUES
  (920101, 'xray-mock-user', 'AI 实验室', 'Mock · AI Agents主题观察与实践记录。', unixepoch() * 1000, 5),
  (920102, 'xray-mock-user', '前端工程', 'Mock · 前端主题观察与实践记录。', unixepoch() * 1000, 6),
  (920103, 'xray-mock-user', '数据与存储', 'Mock · 数据库主题观察与实践记录。', unixepoch() * 1000, 7),
  (920104, 'xray-mock-user', '云端运行记录', 'Mock · 云服务主题观察与实践记录。', unixepoch() * 1000, 8),
  (920105, 'xray-mock-user', '安全与隐私', 'Mock · 安全主题观察与实践记录。', unixepoch() * 1000, 9),
  (920106, 'xray-mock-user', '无障碍笔记', 'Mock · Accessibility主题观察与实践记录。', unixepoch() * 1000, 10),
  (920107, 'xray-mock-user', '产品访谈', 'Mock · 用户研究主题观察与实践记录。', unixepoch() * 1000, 11),
  (920108, 'xray-mock-user', '阅读与写作', 'Mock · 写作主题观察与实践记录。', unixepoch() * 1000, 12),
  (920109, 'xray-mock-user', '发布与复盘', 'Mock · 发布主题观察与实践记录。', unixepoch() * 1000, 13);

INSERT OR IGNORE INTO tags (user_id, name, color)
VALUES
  ('xray-mock-user', '灵感', '#6366f1'),
  ('xray-mock-user', '前端', '#6366f1'),
  ('xray-mock-user', '数据库', '#6366f1'),
  ('xray-mock-user', '云服务', '#6366f1'),
  ('xray-mock-user', '安全', '#6366f1'),
  ('xray-mock-user', '用户研究', '#6366f1'),
  ('xray-mock-user', '写作', '#6366f1'),
  ('xray-mock-user', '发布', '#6366f1'),
  ('xray-mock-user', '单测', '#6366f1'),
  ('xray-mock-user', '性能', '#6366f1'),
  ('xray-mock-user', '隐私', '#6366f1'),
  ('xray-mock-user', '可观测性', '#6366f1'),
  ('xray-mock-user', '文档', '#6366f1'),
  ('xray-mock-user', '原型', '#6366f1'),
  ('xray-mock-user', '待回访', '#6366f1'),
  ('xray-mock-user', '优先关注', '#6366f1'),
  ('xray-mock-user', '历史来源', '#6366f1'),
  ('xray-mock-user', '长期跟踪', '#6366f1'),
  ('xray-mock-user', 'Swift', '#6366f1'),
  ('xray-mock-user', 'Python', '#6366f1'),
  ('xray-mock-user', 'Rust', '#6366f1'),
  ('xray-mock-user', '设计评审', '#6366f1'),
  ('xray-mock-user', '周末计划', '#6366f1'),
  ('xray-mock-user', '数据可视化', '#6366f1');

WITH demo_keys(id, channel_id, channel_name, label, slot) AS (VALUES
  (930000, 1, '研发日报', '研发日报 · 每日记录', 0),
  (930001, 1, '研发日报', '研发日报 · 专题整理', 1),
  (930002, 1, '研发日报', '研发日报 · 历史采集器', 2),
  (930010, 2, '每周观察', '每周观察 · 每日记录', 0),
  (930011, 2, '每周观察', '每周观察 · 专题整理', 1),
  (930012, 2, '每周观察', '每周观察 · 历史采集器', 2),
  (930020, 910101, '产品设计观察', '产品设计观察 · 每日记录', 0),
  (930021, 910101, '产品设计观察', '产品设计观察 · 专题整理', 1),
  (930022, 910101, '产品设计观察', '产品设计观察 · 历史采集器', 2),
  (930030, 910102, '无标签快讯', '无标签快讯 · 每日记录', 0),
  (930031, 910102, '无标签快讯', '无标签快讯 · 专题整理', 1),
  (930032, 910102, '无标签快讯', '无标签快讯 · 历史采集器', 2),
  (930040, 910103, '灵感备忘', '灵感备忘 · 每日记录', 0),
  (930041, 910103, '灵感备忘', '灵感备忘 · 专题整理', 1),
  (930042, 910103, '灵感备忘', '灵感备忘 · 历史采集器', 2),
  (930050, 920101, 'AI 实验室', 'AI 实验室 · 每日记录', 0),
  (930051, 920101, 'AI 实验室', 'AI 实验室 · 专题整理', 1),
  (930052, 920101, 'AI 实验室', 'AI 实验室 · 历史采集器', 2),
  (930060, 920102, '前端工程', '前端工程 · 每日记录', 0),
  (930061, 920102, '前端工程', '前端工程 · 专题整理', 1),
  (930062, 920102, '前端工程', '前端工程 · 历史采集器', 2),
  (930070, 920103, '数据与存储', '数据与存储 · 每日记录', 0),
  (930071, 920103, '数据与存储', '数据与存储 · 专题整理', 1),
  (930072, 920103, '数据与存储', '数据与存储 · 历史采集器', 2),
  (930080, 920104, '云端运行记录', '云端运行记录 · 每日记录', 0),
  (930081, 920104, '云端运行记录', '云端运行记录 · 专题整理', 1),
  (930082, 920104, '云端运行记录', '云端运行记录 · 历史采集器', 2),
  (930090, 920105, '安全与隐私', '安全与隐私 · 每日记录', 0),
  (930091, 920105, '安全与隐私', '安全与隐私 · 专题整理', 1),
  (930092, 920105, '安全与隐私', '安全与隐私 · 历史采集器', 2),
  (930100, 920106, '无障碍笔记', '无障碍笔记 · 每日记录', 0),
  (930101, 920106, '无障碍笔记', '无障碍笔记 · 专题整理', 1),
  (930102, 920106, '无障碍笔记', '无障碍笔记 · 历史采集器', 2),
  (930110, 920107, '产品访谈', '产品访谈 · 每日记录', 0),
  (930111, 920107, '产品访谈', '产品访谈 · 专题整理', 1),
  (930112, 920107, '产品访谈', '产品访谈 · 历史采集器', 2),
  (930120, 920108, '阅读与写作', '阅读与写作 · 每日记录', 0),
  (930121, 920108, '阅读与写作', '阅读与写作 · 专题整理', 1),
  (930122, 920108, '阅读与写作', '阅读与写作 · 历史采集器', 2),
  (930130, 920109, '发布与复盘', '发布与复盘 · 每日记录', 0),
  (930131, 920109, '发布与复盘', '发布与复盘 · 专题整理', 1),
  (930132, 920109, '发布与复盘', '发布与复盘 · 历史采集器', 2)
)
INSERT OR IGNORE INTO push_tokens (id,user_id,channel_id,token_prefix,token_hash,label,scopes,created_at_ms,last_used_at_ms,revoked_at_ms)
SELECT k.id,c.user_id,c.id,'mock_' || k.id,'mock-only:not-a-sha256:' || k.id,k.label,'["articles:write"]',
  (unixepoch()-40*86400)*1000, CASE WHEN k.slot <> 1 THEN (unixepoch()-9*86400)*1000 END,
  CASE WHEN k.slot=2 THEN (unixepoch()-2*86400)*1000 END
FROM demo_keys k JOIN channels c ON c.id=k.channel_id AND c.name=k.channel_name
WHERE c.user_id='xray-mock-user';

WITH associations(channel_id, channel_name, tag_name) AS (VALUES
  (1, '研发日报', '研发'),
  (1, '研发日报', '长期跟踪'),
  (2, '每周观察', '每周观察'),
  (910101, '产品设计观察', '产品设计'),
  (910103, '灵感备忘', '灵感'),
  (920101, 'AI 实验室', 'AI Agents'),
  (920102, '前端工程', '前端'),
  (920102, '前端工程', '长期跟踪'),
  (920103, '数据与存储', '数据库'),
  (920104, '云端运行记录', '云服务'),
  (920105, '安全与隐私', '安全'),
  (920105, '安全与隐私', '长期跟踪'),
  (920106, '无障碍笔记', 'Accessibility'),
  (920107, '产品访谈', '用户研究'),
  (920108, '阅读与写作', '写作'),
  (920108, '阅读与写作', '长期跟踪'),
  (920109, '发布与复盘', '发布')
)
INSERT OR IGNORE INTO channel_tags (channel_id, tag_id)
SELECT c.id,t.id FROM associations a
JOIN channels c ON c.id=a.channel_id AND c.name=a.channel_name AND c.user_id='xray-mock-user'
JOIN tags t ON t.user_id=c.user_id AND t.name=a.tag_name;

WITH associations(key_id, tag_name) AS (VALUES
  (930000, '研发'),
  (930000, '长期跟踪'),
  (930001, '深度阅读'),
  (930001, '优先关注'),
  (930002, '历史来源'),
  (930010, '每周观察'),
  (930010, '长期跟踪'),
  (930011, '深度阅读'),
  (930011, '优先关注'),
  (930012, '历史来源'),
  (930020, '产品设计'),
  (930020, '长期跟踪'),
  (930021, '深度阅读'),
  (930021, '优先关注'),
  (930022, '历史来源'),
  (930040, '灵感'),
  (930040, '长期跟踪'),
  (930041, '深度阅读'),
  (930041, '优先关注'),
  (930042, '历史来源'),
  (930050, 'AI Agents'),
  (930050, '长期跟踪'),
  (930051, '深度阅读'),
  (930051, '优先关注'),
  (930052, '历史来源'),
  (930060, '前端'),
  (930060, '长期跟踪'),
  (930061, '深度阅读'),
  (930061, '优先关注'),
  (930062, '历史来源'),
  (930070, '数据库'),
  (930070, '长期跟踪'),
  (930071, '深度阅读'),
  (930071, '优先关注'),
  (930072, '历史来源'),
  (930080, '云服务'),
  (930080, '长期跟踪'),
  (930081, '深度阅读'),
  (930081, '优先关注'),
  (930082, '历史来源'),
  (930090, '安全'),
  (930090, '长期跟踪'),
  (930091, '深度阅读'),
  (930091, '优先关注'),
  (930092, '历史来源'),
  (930100, 'Accessibility'),
  (930100, '长期跟踪'),
  (930101, '深度阅读'),
  (930101, '优先关注'),
  (930102, '历史来源'),
  (930110, '用户研究'),
  (930110, '长期跟踪'),
  (930111, '深度阅读'),
  (930111, '优先关注'),
  (930112, '历史来源'),
  (930120, '写作'),
  (930120, '长期跟踪'),
  (930121, '深度阅读'),
  (930121, '优先关注'),
  (930122, '历史来源'),
  (930130, '发布'),
  (930130, '长期跟踪'),
  (930131, '深度阅读'),
  (930131, '优先关注'),
  (930132, '历史来源')
)
INSERT OR IGNORE INTO channel_key_tags (key_id,tag_id)
SELECT k.id,t.id FROM associations a
JOIN push_tokens k ON k.id=a.key_id AND k.token_hash='mock-only:not-a-sha256:' || a.key_id
JOIN tags t ON t.user_id=k.user_id AND t.name=a.tag_name
WHERE k.user_id='xray-mock-user';

WITH topics(topic_id, channel_name, source_url, source_label) AS (VALUES
  (0, '研发日报', 'https://developers.cloudflare.com/workers/', '运行时文档'),
  (1, '每周观察', 'https://github.com/tw93/Kami', 'Kami'),
  (2, '产品设计观察', 'https://github.com/nocoo/basalt', 'Basalt'),
  (3, '无标签快讯', NULL, ''),
  (4, '灵感备忘', 'https://github.com/tw93/Kami', '阅读工具'),
  (5, 'AI 实验室', 'https://platform.openai.com/docs', 'API 文档'),
  (6, '前端工程', 'https://developer.mozilla.org/en-US/docs/Web', 'MDN'),
  (7, '数据与存储', 'https://www.sqlite.org/lang.html', 'SQLite 文档'),
  (8, '云端运行记录', 'https://developers.cloudflare.com/workers/', 'Workers'),
  (9, '安全与隐私', 'https://owasp.org/www-project-top-ten/', 'OWASP'),
  (10, '无障碍笔记', 'https://www.w3.org/WAI/tutorials/', 'WAI 教程'),
  (11, '产品访谈', 'https://www.nngroup.com/articles/', '研究文章'),
  (12, '阅读与写作', 'https://github.com/tw93/Kami', '阅读入口'),
  (13, '发布与复盘', 'https://docs.github.com/en/repositories/releasing-projects-on-github', '发布文档')),
formats(format_id, markdown) AS (VALUES
  (0, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

### 具体场景

讨论「{{topic}}」时，我们先把触发条件写清楚，再比较理想行为和实际表现。{{summary}}这里关注的是可重复观察的结果，而不是一次顺利运行带来的印象。

### 需要保留的证据

把输入、时间、操作步骤和最后的状态放在一起，下一次回看就能复现讨论。不同来源可能使用不同的术语，先对齐问题，再决定是否采用某个方案。

### 下一步

先选择一个最小样本进行验证，确认没有破坏已有流程之后再扩大范围。尚未得到答案的部分留在问题列表中，避免把推测写成事实。

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (1, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

| 阶段 | 当前关注 | 完成条件 |
| --- | --- | --- |
| 观察 | {{topic}} | 保留原始材料 |
| 比较 | 不同场景的差异 | 找到可重复的结果 |
| 回访 | 修改后的行为 | 确认问题已解决 |

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (2, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

- [x] 收集一个实际案例
- [x] 记录观察到的行为
- [ ] 验证边界场景
- [ ] 下周回看结论

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (3, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

```json
{
  "topic": "{{topic}}",
  "status": "review",
  "fixture": true
}
```

上面的结构仅用于展示代码阅读，不包含任何凭据。

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (4, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

### 具体场景

讨论「{{topic}}」时，我们先把触发条件写清楚，再比较理想行为和实际表现。{{summary}}这里关注的是可重复观察的结果，而不是一次顺利运行带来的印象。

### 需要保留的证据

把输入、时间、操作步骤和最后的状态放在一起，下一次回看就能复现讨论。不同来源可能使用不同的术语，先对齐问题，再决定是否采用某个方案。

### 下一步

先选择一个最小样本进行验证，确认没有破坏已有流程之后再扩大范围。尚未得到答案的部分留在问题列表中，避免把推测写成事实。

继续阅读：[{{source}}][source]。

[source]: {{url}}

[暂时不可用的公开资料]({{missing}})
'),
  (5, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

> 把当时的问题写清楚，未来才知道结论回答了什么。

这个判断还需要更多样本，暂时保留为观察，不作为已经验证的事实。

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (6, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

![阅读记录的桌面](https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=960&q=80)

图片不可用时，文字与来源仍然可以阅读。

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (7, '## {{topic}}

{{summary}}

这是一份用于本地阅读与管理场景的 Mock 记录。主题属于「{{channel}}」，内容保留观察依据、下一步问题和公开阅读入口。

### 补充问题

1. 这个问题出现的频率有多高？
2. 谁会受到影响？
3. 下一次应该观察什么变化？

继续阅读：[{{source}}][source]。

[source]: {{url}}
'),
  (8, '{{summary}}

今天的快讯没有附件和外部链接。')),
phases(phase, markdown) AS (VALUES
  ('观察',''),
  ('记录',''),
  ('复盘','
### 复盘补记

回看最初关于「{{topic}}」的记录，我们把正常路径与失败路径放在一起比较。已确认的行为保留，未复现的现象继续记录触发条件。
'),
  ('验证','
### 验证补记

本轮针对「{{topic}}」补充边界验证：重复触发、取消后重试，以及完成时切换页面。结论仍以实际观察为准，Mock 内容只用于呈现记录结构。
')),
demo_reports(id,key_id,external_id,title,age_days,summary,topic,topic_id,format_id,phase,missing_url) AS (VALUES
  (950000, 930000, 'mock-catalog-v2-1-01', '请求超时的边界 · 观察', 1, '下游连接迟迟没有返回时，取消信号应沿调用链传递，而不是只隐藏界面上的加载提示。', '请求超时的边界', 0, 0, '观察', 'https://example.com/xray-mock-missing-0-0'),
  (950001, 930001, 'mock-catalog-v2-1-02', '任务队列的背压 · 观察', 2, '高峰期先限制正在执行的任务，剩余请求排队，避免一次刷新让所有来源同时争抢连接。', '任务队列的背压', 0, 1, '观察', 'https://example.com/xray-mock-missing-0-1'),
  (950002, 930002, 'mock-catalog-v2-1-03', '缓存与身份隔离 · 观察', 3, '同一地址在不同账号下可能得到不同的内容。缓存必须与当前身份生命周期一致。', '缓存与身份隔离', 0, 2, '观察', 'https://example.com/xray-mock-missing-0-2'),
  (950003, 930000, 'mock-catalog-v2-1-04', '错误提示的落点 · 观察', 4, '错误应该靠近触发它的操作，保留用户已输入的内容，允许直接修正后重试。', '错误提示的落点', 0, 3, '观察', 'https://example.com/xray-mock-missing-0-3'),
  (950004, 930001, 'mock-catalog-v2-1-05', '日期分页的稳定性 · 观察', 5, '补交旧报告时，列表仍按报告日期排序；同一天的多篇内容通过稳定编号区分。', '日期分页的稳定性', 0, 4, '观察', 'https://example.com/xray-mock-missing-0-4'),
  (950005, 930002, 'mock-catalog-v2-1-06', '键盘焦点回路 · 观察', 6, '弹窗关闭后回到原操作按钮；删除了当前记录，就把焦点交给附近可继续工作的控件。', '键盘焦点回路', 0, 5, '观察', 'https://example.com/xray-mock-missing-0-5'),
  (950006, 930000, 'mock-catalog-v2-1-07', '接口契约的空值 · 观察', 7, '缺少摘要和空字符串并不总是同一件事。界面需要保持可读，同时避免编造原文没有的信息。', '接口契约的空值', 0, 6, '观察', 'https://example.com/xray-mock-missing-0-6'),
  (950007, 930001, 'mock-catalog-v2-1-08', '一次性凭据的展示 · 观察', 8, '创建成功后只在当前弹窗显示凭据。关闭弹窗即清除明文，历史列表只保留前缀。', '一次性凭据的展示', 0, 7, '观察', 'https://example.com/xray-mock-missing-0-7'),
  (950008, 930002, 'mock-catalog-v2-1-09', '请求超时的边界 · 复盘', 9, '下游连接迟迟没有返回时，取消信号应沿调用链传递，而不是只隐藏界面上的加载提示。', '请求超时的边界', 0, 0, '复盘', 'https://example.com/xray-mock-missing-0-8'),
  (950009, 930000, 'mock-catalog-v2-1-10', '任务队列的背压 · 复盘', 10, '高峰期先限制正在执行的任务，剩余请求排队，避免一次刷新让所有来源同时争抢连接。', '任务队列的背压', 0, 1, '复盘', 'https://example.com/xray-mock-missing-0-9'),
  (950010, 930001, 'mock-catalog-v2-1-11', '缓存与身份隔离 · 复盘', 11, '同一地址在不同账号下可能得到不同的内容。缓存必须与当前身份生命周期一致。', '缓存与身份隔离', 0, 2, '复盘', 'https://example.com/xray-mock-missing-0-10'),
  (950011, 930002, 'mock-catalog-v2-1-12', '错误提示的落点 · 复盘', 12, '错误应该靠近触发它的操作，保留用户已输入的内容，允许直接修正后重试。', '错误提示的落点', 0, 3, '复盘', 'https://example.com/xray-mock-missing-0-11'),
  (950012, 930000, 'mock-catalog-v2-1-13', '日期分页的稳定性 · 复盘', 13, '补交旧报告时，列表仍按报告日期排序；同一天的多篇内容通过稳定编号区分。', '日期分页的稳定性', 0, 4, '复盘', 'https://example.com/xray-mock-missing-0-12'),
  (950013, 930001, 'mock-catalog-v2-1-14', '键盘焦点回路 · 复盘', 14, '弹窗关闭后回到原操作按钮；删除了当前记录，就把焦点交给附近可继续工作的控件。', '键盘焦点回路', 0, 5, '复盘', 'https://example.com/xray-mock-missing-0-13'),
  (950014, 930002, 'mock-catalog-v2-1-15', '接口契约的空值 · 复盘', 15, '缺少摘要和空字符串并不总是同一件事。界面需要保持可读，同时避免编造原文没有的信息。', '接口契约的空值', 0, 6, '复盘', 'https://example.com/xray-mock-missing-0-14'),
  (950015, 930000, 'mock-catalog-v2-1-16', '一次性凭据的展示 · 复盘', 16, '创建成功后只在当前弹窗显示凭据。关闭弹窗即清除明文，历史列表只保留前缀。', '一次性凭据的展示', 0, 7, '复盘', 'https://example.com/xray-mock-missing-0-15'),
  (950016, 930001, 'mock-catalog-v2-1-17', '请求超时的边界 · 验证', 17, '下游连接迟迟没有返回时，取消信号应沿调用链传递，而不是只隐藏界面上的加载提示。', '请求超时的边界', 0, 0, '验证', 'https://example.com/xray-mock-missing-0-16'),
  (950017, 930002, 'mock-catalog-v2-1-18', '任务队列的背压 · 验证', 18, '高峰期先限制正在执行的任务，剩余请求排队，避免一次刷新让所有来源同时争抢连接。', '任务队列的背压', 0, 1, '验证', 'https://example.com/xray-mock-missing-0-17'),
  (950018, 930000, 'mock-catalog-v2-1-19', '缓存与身份隔离 · 验证', 19, '同一地址在不同账号下可能得到不同的内容。缓存必须与当前身份生命周期一致。', '缓存与身份隔离', 0, 2, '验证', 'https://example.com/xray-mock-missing-0-18'),
  (950019, 930001, 'mock-catalog-v2-1-20', '错误提示的落点 · 验证', 20, '错误应该靠近触发它的操作，保留用户已输入的内容，允许直接修正后重试。', '错误提示的落点', 0, 3, '验证', 'https://example.com/xray-mock-missing-0-19'),
  (950020, 930002, 'mock-catalog-v2-1-21', '日期分页的稳定性 · 验证', 21, '补交旧报告时，列表仍按报告日期排序；同一天的多篇内容通过稳定编号区分。', '日期分页的稳定性', 0, 4, '验证', 'https://example.com/xray-mock-missing-0-20'),
  (950021, 930000, 'mock-catalog-v2-1-22', '键盘焦点回路 · 验证', 22, '弹窗关闭后回到原操作按钮；删除了当前记录，就把焦点交给附近可继续工作的控件。', '键盘焦点回路', 0, 5, '验证', 'https://example.com/xray-mock-missing-0-21'),
  (950022, 930001, 'mock-catalog-v2-1-23', '接口契约的空值 · 验证', 23, '缺少摘要和空字符串并不总是同一件事。界面需要保持可读，同时避免编造原文没有的信息。', '接口契约的空值', 0, 6, '验证', 'https://example.com/xray-mock-missing-0-22'),
  (950023, 930002, 'mock-catalog-v2-1-24', '一次性凭据的展示 · 验证', 24, '创建成功后只在当前弹窗显示凭据。关闭弹窗即清除明文，历史列表只保留前缀。', '一次性凭据的展示', 0, 7, '验证', 'https://example.com/xray-mock-missing-0-23'),
  (950100, 930010, 'mock-catalog-v2-2-01', '独立工具的使用周期 · 记录', 0, '试用第一天的惊喜不等于长期价值。观察第三周是否仍然愿意打开，才能识别真实需求。', '独立工具的使用周期', 1, 0, '记录', 'https://example.com/xray-mock-missing-1-0'),
  (950101, 930011, 'mock-catalog-v2-2-02', '信息源的偏差 · 记录', 1, '同一新闻被多次转载不会增加证据。周报应回到最早发布的材料，区分事实与观点。', '信息源的偏差', 1, 1, '记录', 'https://example.com/xray-mock-missing-1-1'),
  (950102, 930012, 'mock-catalog-v2-2-03', '阅读记录的回访 · 记录', 2, '为一条链接写下为什么保存，比继续添加更多链接更能帮助后续检索。', '阅读记录的回访', 1, 2, '记录', 'https://example.com/xray-mock-missing-1-2'),
  (950103, 930010, 'mock-catalog-v2-2-04', '学习计划的留白 · 记录', 3, '把每晚都排满容易让计划变成负担。保留一段不安排内容的时间，用来消化和复盘。', '学习计划的留白', 1, 3, '记录', 'https://example.com/xray-mock-missing-1-3'),
  (950104, 930011, 'mock-catalog-v2-2-05', '团队共识的形成 · 记录', 4, '会议结束后各自复述一次决策，能发现大家以为一致、实际理解不同的细节。', '团队共识的形成', 1, 4, '记录', 'https://example.com/xray-mock-missing-1-4'),
  (950105, 930012, 'mock-catalog-v2-2-06', '工具替换的成本 · 记录', 5, '迁移不仅是导出数据，还包括快捷键、习惯和失败时的处理方法。应当把这些成本算进去。', '工具替换的成本', 1, 5, '记录', 'https://example.com/xray-mock-missing-1-5'),
  (950106, 930010, 'mock-catalog-v2-2-07', '小项目的维护 · 记录', 6, '一个明确的入口和一份能复现的开发说明，可以减少几个月后重新打开项目的阻力。', '小项目的维护', 1, 6, '记录', 'https://example.com/xray-mock-missing-1-6'),
  (950107, 930011, 'mock-catalog-v2-2-08', '一周的未解问题 · 记录', 7, '没有答案的问题也值得记录。保留当时的上下文，避免下一次又从相同的猜测开始。', '一周的未解问题', 1, 7, '记录', 'https://example.com/xray-mock-missing-1-7'),
  (950200, 930020, 'mock-catalog-v2-910101-01', '表单的收尾 · 记录', 0, '保存按钮应处于稳定位置，状态提示与动作相邻，让用户明确知道修改是否生效。', '表单的收尾', 2, 0, '记录', 'https://example.com/xray-mock-missing-2-0'),
  (950201, 930021, 'mock-catalog-v2-910101-02', '空状态的第一步 · 记录', 1, '空状态只需要解释这里放什么，并给出能够立即执行的动作，不必用长篇介绍占满页面。', '空状态的第一步', 2, 1, '记录', 'https://example.com/xray-mock-missing-2-1'),
  (950202, 930022, 'mock-catalog-v2-910101-03', '侧栏的信息密度 · 记录', 2, '导航保留稳定顺序和清楚的分组，辅助操作收敛到一处，避免每一行都有不同的视觉重量。', '侧栏的信息密度', 2, 2, '记录', 'https://example.com/xray-mock-missing-2-2'),
  (950203, 930020, 'mock-catalog-v2-910101-04', '筛选的可撤销性 · 记录', 3, '每个筛选都应该有清楚的当前状态。清除筛选应保留排序，不让用户重新配置整张列表。', '筛选的可撤销性', 2, 3, '记录', 'https://example.com/xray-mock-missing-2-3'),
  (950204, 930021, 'mock-catalog-v2-910101-05', '颜色作为辅助线索 · 记录', 4, '颜色帮助辨认标签，但不能独自承担状态表达。名字与操作在黑白环境下也应当清楚。', '颜色作为辅助线索', 2, 4, '记录', 'https://example.com/xray-mock-missing-2-4'),
  (950205, 930022, 'mock-catalog-v2-910101-06', '危险操作的文案 · 记录', 5, '确认框说明会删除什么、保留什么，以及动作是否可恢复，避免笼统的确定和取消。', '危险操作的文案', 2, 5, '记录', 'https://example.com/xray-mock-missing-2-5'),
  (950206, 930020, 'mock-catalog-v2-910101-07', '小屏操作区 · 记录', 6, '窄屏先保证正文和主要动作，辅助列可以收起。不能通过无限缩小字体来维持桌面布局。', '小屏操作区', 2, 6, '记录', 'https://example.com/xray-mock-missing-2-6'),
  (950207, 930021, 'mock-catalog-v2-910101-08', '渐进披露的节奏 · 记录', 7, '常用信息留在眼前，偶尔需要的配置进入弹窗。层级由任务频率决定，而不是控件数量。', '渐进披露的节奏', 2, 7, '记录', 'https://example.com/xray-mock-missing-2-7'),
  (950300, 930030, 'mock-catalog-v2-910102-01', '晨间记录 · 记录', 0, '今天先处理最小而明确的一件事，完成后再打开新的任务。', '晨间记录', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-0'),
  (950301, 930031, 'mock-catalog-v2-910102-02', '午间散步 · 记录', 1, '离开屏幕十分钟，回来看刚才的问题，往往更容易判断真正重要的部分。', '午间散步', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-1'),
  (950302, 930032, 'mock-catalog-v2-910102-03', '随手归档 · 记录', 2, '把已经完成的记录移出工作视线，留下当前仍需要行动的内容。', '随手归档', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-2'),
  (950303, 930030, 'mock-catalog-v2-910102-04', '一句反馈 · 记录', 3, '把观察到的行为说清楚，比给出笼统评价更容易推动调整。', '一句反馈', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-3'),
  (950304, 930031, 'mock-catalog-v2-910102-05', '短会结论 · 记录', 4, '这次只确认下一步负责人和完成条件，不扩展新的讨论。', '短会结论', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-4'),
  (950305, 930032, 'mock-catalog-v2-910102-06', '工作收尾 · 记录', 5, '停止前留下一个可继续的入口，明天就不必重新寻找上下文。', '工作收尾', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-5'),
  (950306, 930030, 'mock-catalog-v2-910102-07', '小修复 · 记录', 6, '修好了一个影响操作的小问题，今天的记录到这里。', '小修复', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-6'),
  (950307, 930031, 'mock-catalog-v2-910102-08', '周末留白 · 记录', 7, '没有需要补充的附件，也没有新的链接，留一点空白。', '周末留白', 3, 8, '记录', 'https://example.com/xray-mock-missing-3-7'),
  (950400, 930040, 'mock-catalog-v2-910103-01', '离线阅读盒子 · 记录', 0, '把待读资料变成一个可以离线打开的小集合，通勤途中不再被网络状态打断。', '离线阅读盒子', 4, 0, '记录', 'https://example.com/xray-mock-missing-4-0'),
  (950401, 930041, 'mock-catalog-v2-910103-02', '给未来的便签 · 记录', 1, '为一段代码留下当时否定过的方案，帮助未来的自己理解为什么这样写。', '给未来的便签', 4, 1, '记录', 'https://example.com/xray-mock-missing-4-1'),
  (950402, 930042, 'mock-catalog-v2-910103-03', '十分钟原型 · 记录', 2, '用最少控件表达核心动作，让一次试用回答一个问题，避免先设计完整产品。', '十分钟原型', 4, 2, '记录', 'https://example.com/xray-mock-missing-4-2'),
  (950403, 930040, 'mock-catalog-v2-910103-04', '声音与专注 · 记录', 3, '同一段环境声是否能形成工作开始的信号，可以用一周小样本试试看。', '声音与专注', 4, 3, '记录', 'https://example.com/xray-mock-missing-4-3'),
  (950404, 930041, 'mock-catalog-v2-910103-05', '家庭照片的目录 · 记录', 4, '按事件而不是设备来源整理照片，让寻找一段回忆更接近日常语言。', '家庭照片的目录', 4, 4, '记录', 'https://example.com/xray-mock-missing-4-4'),
  (950405, 930042, 'mock-catalog-v2-910103-06', '慢速订阅 · 记录', 5, '每周只发送一次精选资料，允许读者轻松清空，而不是不断积累未读数量。', '慢速订阅', 4, 5, '记录', 'https://example.com/xray-mock-missing-4-5'),
  (950406, 930040, 'mock-catalog-v2-910103-07', '桌面小仪表 · 记录', 6, '把当天唯一重要的指标放到角落，其他数字只有需要时才展开。', '桌面小仪表', 4, 6, '记录', 'https://example.com/xray-mock-missing-4-6'),
  (950407, 930041, 'mock-catalog-v2-910103-08', '散步地图 · 记录', 7, '记录走过的小路和想再次停留的地方，不追求打卡数量。', '散步地图', 4, 7, '记录', 'https://example.com/xray-mock-missing-4-7'),
  (950500, 930050, 'mock-catalog-v2-920101-01', '提示词的对照组 · 记录', 0, '比较两个提示词时保持模型、输入和评价标准一致，否则差异无法归因。', '提示词的对照组', 5, 0, '记录', 'https://example.com/xray-mock-missing-5-0'),
  (950501, 930051, 'mock-catalog-v2-920101-02', '结构化输出 · 记录', 1, '先约束需要消费的字段，再讨论自然语言表达，让后续程序无需猜测段落结构。', '结构化输出', 5, 1, '记录', 'https://example.com/xray-mock-missing-5-1'),
  (950502, 930052, 'mock-catalog-v2-920101-03', '上下文的裁剪 · 记录', 2, '保留任务约束和关键证据，优先删去重复转述，减少窗口中的无效占用。', '上下文的裁剪', 5, 2, '记录', 'https://example.com/xray-mock-missing-5-2'),
  (950503, 930050, 'mock-catalog-v2-920101-04', '工具调用的授权 · 记录', 3, '把读取和写入动作分开，明确哪些动作可以自动继续，哪些需要用户确认。', '工具调用的授权', 5, 3, '记录', 'https://example.com/xray-mock-missing-5-3'),
  (950504, 930051, 'mock-catalog-v2-920101-05', '评测集的覆盖 · 记录', 4, '除了正常输入，还应记录空结果、歧义和工具超时，让质量不只反映顺利的案例。', '评测集的覆盖', 5, 4, '记录', 'https://example.com/xray-mock-missing-5-4'),
  (950505, 930052, 'mock-catalog-v2-920101-06', '人类复核的位置 · 记录', 5, '复核应发生在结果具体可审查的时候，抽象计划往往不足以判断真正的风险。', '人类复核的位置', 5, 5, '记录', 'https://example.com/xray-mock-missing-5-5'),
  (950506, 930050, 'mock-catalog-v2-920101-07', '成本与延迟 · 记录', 6, '短任务未必需要最复杂的模型。先测量完成率，再比较成本与等待时间。', '成本与延迟', 5, 6, '记录', 'https://example.com/xray-mock-missing-5-6'),
  (950507, 930051, 'mock-catalog-v2-920101-08', '代理的停止条件 · 记录', 7, '任务完成后停止比不断寻找新工作更可靠。把可验收的终点写进流程。', '代理的停止条件', 5, 7, '记录', 'https://example.com/xray-mock-missing-5-7'),
  (950600, 930060, 'mock-catalog-v2-920102-01', '容器宽度与断点 · 记录', 0, '组件布局应响应可用内容宽度，而不是只根据整块屏幕判断能否容纳侧栏。', '容器宽度与断点', 6, 0, '记录', 'https://example.com/xray-mock-missing-6-0'),
  (950601, 930061, 'mock-catalog-v2-920102-02', '图片加载失败 · 记录', 1, '图片不可用时保留标题和链接，避免一张损坏的图片占据整块内容区。', '图片加载失败', 6, 1, '记录', 'https://example.com/xray-mock-missing-6-1'),
  (950602, 930062, 'mock-catalog-v2-920102-03', '长文本换行 · 记录', 2, '长网址和连续字符需要独立处理，不能让它们把表格或卡片推到视口外面。', '长文本换行', 6, 2, '记录', 'https://example.com/xray-mock-missing-6-2'),
  (950603, 930060, 'mock-catalog-v2-920102-04', '表单草稿保留 · 记录', 3, '提交失败后不清空输入，把错误放在表单内部，方便修改后再次提交。', '表单草稿保留', 6, 3, '记录', 'https://example.com/xray-mock-missing-6-3'),
  (950604, 930061, 'mock-catalog-v2-920102-05', '组件状态归属 · 记录', 4, '业务异步留在 ViewModel，视图负责控件和焦点，避免网络请求散落在多个按钮里。', '组件状态归属', 6, 4, '记录', 'https://example.com/xray-mock-missing-6-4'),
  (950605, 930062, 'mock-catalog-v2-920102-06', '渲染键的稳定性 · 记录', 5, '列表 key 反映资源身份，不应该包含整段长文，也不应随着无关的视觉状态改变。', '渲染键的稳定性', 6, 5, '记录', 'https://example.com/xray-mock-missing-6-5'),
  (950606, 930060, 'mock-catalog-v2-920102-07', '懒加载的触发 · 记录', 6, '只为接近可见区域的卡片请求补充信息，先让最基础的内容立即可读。', '懒加载的触发', 6, 6, '记录', 'https://example.com/xray-mock-missing-6-6'),
  (950607, 930061, 'mock-catalog-v2-920102-08', '选择器的键盘路径 · 记录', 7, '从打开到选择再到关闭，每一步都应能通过键盘完成，并恢复到稳定的焦点。', '选择器的键盘路径', 6, 7, '记录', 'https://example.com/xray-mock-missing-6-7'),
  (950700, 930070, 'mock-catalog-v2-920103-01', '唯一约束与重试 · 记录', 0, '生产者重试使用稳定外部编号，让数据库约束完成去重，而不是依赖客户端猜测。', '唯一约束与重试', 7, 0, '记录', 'https://example.com/xray-mock-missing-7-0'),
  (950701, 930071, 'mock-catalog-v2-920103-02', '事务的边界 · 记录', 1, '一组标签替换应当原子完成，避免中途失败后留下只删不加的状态。', '事务的边界', 7, 1, '记录', 'https://example.com/xray-mock-missing-7-1'),
  (950702, 930072, 'mock-catalog-v2-920103-03', '索引与排序 · 记录', 2, '索引顺序要服务真实查询，先看过滤条件和排序字段，再决定是否新增索引。', '索引与排序', 7, 2, '记录', 'https://example.com/xray-mock-missing-7-2'),
  (950703, 930070, 'mock-catalog-v2-920103-04', '空集合与空值 · 记录', 3, '没有标签是空集合，没有摘要是空值，接口应保持两者语义清楚。', '空集合与空值', 7, 3, '记录', 'https://example.com/xray-mock-missing-7-3'),
  (950704, 930071, 'mock-catalog-v2-920103-05', '本地种子的幂等 · 记录', 4, '再次启动不应覆盖用户修改，测试要在导入后编辑数据，再验证第二次导入。', '本地种子的幂等', 7, 4, '记录', 'https://example.com/xray-mock-missing-7-4'),
  (950705, 930072, 'mock-catalog-v2-920103-06', '游标分页 · 记录', 5, '同日期数据需要稳定的第二排序键，否则翻页容易重复或漏掉边界记录。', '游标分页', 7, 5, '记录', 'https://example.com/xray-mock-missing-7-5'),
  (950706, 930070, 'mock-catalog-v2-920103-07', '关联数据删除 · 记录', 6, '删除父资源时明确哪些关联随之删除，哪些历史信息必须保留。', '关联数据删除', 7, 6, '记录', 'https://example.com/xray-mock-missing-7-6'),
  (950707, 930071, 'mock-catalog-v2-920103-08', '备份恢复演练 · 记录', 7, '备份文件存在并不代表能够恢复，定期在隔离环境里验证读取流程。', '备份恢复演练', 7, 7, '记录', 'https://example.com/xray-mock-missing-7-7'),
  (950800, 930080, 'mock-catalog-v2-920104-01', '冷启动观察 · 记录', 0, '区分首次请求和稳定运行后的延迟，避免用一个平均值掩盖不同阶段。', '冷启动观察', 8, 0, '记录', 'https://example.com/xray-mock-missing-8-0'),
  (950801, 930081, 'mock-catalog-v2-920104-02', '连接超时 · 记录', 1, '对外请求需要明确期限，超时后的错误不应把后续队列永远卡住。', '连接超时', 8, 1, '记录', 'https://example.com/xray-mock-missing-8-1'),
  (950802, 930082, 'mock-catalog-v2-920104-03', '配置分层 · 记录', 2, '开发环境和生产环境使用明确的入口，凭据留在服务端，不进入页面状态。', '配置分层', 8, 2, '记录', 'https://example.com/xray-mock-missing-8-2'),
  (950803, 930080, 'mock-catalog-v2-920104-04', '错误率与流量 · 记录', 3, '低流量时单次错误会造成很高比例，阅读图表时需要同时看请求数量。', '错误率与流量', 8, 3, '记录', 'https://example.com/xray-mock-missing-8-3'),
  (950804, 930081, 'mock-catalog-v2-920104-05', '逐步发布 · 记录', 4, '先验证最小可用路径，再观察关键指标，确认没有异常后扩大覆盖。', '逐步发布', 8, 4, '记录', 'https://example.com/xray-mock-missing-8-4'),
  (950805, 930082, 'mock-catalog-v2-920104-06', '资源回收 · 记录', 5, '请求取消后释放连接和监听器，避免页面切换留下继续运行的工作。', '资源回收', 8, 5, '记录', 'https://example.com/xray-mock-missing-8-5'),
  (950806, 930080, 'mock-catalog-v2-920104-07', '重试预算 · 记录', 6, '重试需要上限和间隔，并且只有可安全重放的请求才适合自动再次执行。', '重试预算', 8, 6, '记录', 'https://example.com/xray-mock-missing-8-6'),
  (950807, 930081, 'mock-catalog-v2-920104-08', '健康检查 · 记录', 7, '存活检查保持轻量，同时将真正的业务故障留在更具体的监控里。', '健康检查', 8, 7, '记录', 'https://example.com/xray-mock-missing-8-7'),
  (950900, 930090, 'mock-catalog-v2-920105-01', '租户边界 · 记录', 0, '资源归属来自认证上下文，不接受请求正文中自称的用户编号。', '租户边界', 9, 0, '记录', 'https://example.com/xray-mock-missing-9-0'),
  (950901, 930091, 'mock-catalog-v2-920105-02', '日志中的敏感内容 · 记录', 1, '记录结果和必要的上下文，不写入完整 token、密钥或请求正文。', '日志中的敏感内容', 9, 1, '记录', 'https://example.com/xray-mock-missing-9-1'),
  (950902, 930092, 'mock-catalog-v2-920105-03', '外链预览的边界 · 记录', 2, '预览服务只处理允许的公开地址，重定向后也需要重新检查目标。', '外链预览的边界', 9, 2, '记录', 'https://example.com/xray-mock-missing-9-2'),
  (950903, 930090, 'mock-catalog-v2-920105-04', '删除确认 · 记录', 3, '不可恢复的动作在执行前说明影响范围，让用户能够判断是否符合意图。', '删除确认', 9, 3, '记录', 'https://example.com/xray-mock-missing-9-3'),
  (950904, 930091, 'mock-catalog-v2-920105-05', '凭据轮换 · 记录', 4, '新凭据验证可用之后再撤销旧凭据，并让列表中清楚区分状态。', '凭据轮换', 9, 4, '记录', 'https://example.com/xray-mock-missing-9-4'),
  (950905, 930092, 'mock-catalog-v2-920105-06', '最小权限 · 记录', 5, '每个生产者只拿到当前频道的写入能力，不顺便开放管理接口。', '最小权限', 9, 5, '记录', 'https://example.com/xray-mock-missing-9-5'),
  (950906, 930090, 'mock-catalog-v2-920105-07', '来源校验 · 记录', 6, '浏览器写入操作保留来源检查，不让认证 cookie 成为跨站请求的通行证。', '来源校验', 9, 6, '记录', 'https://example.com/xray-mock-missing-9-6'),
  (950907, 930091, 'mock-catalog-v2-920105-08', '失效默认拒绝 · 记录', 7, '验证发生冲突或配置缺失时停止执行，避免通过宽松回退隐藏问题。', '失效默认拒绝', 9, 7, '记录', 'https://example.com/xray-mock-missing-9-7'),
  (951000, 930100, 'mock-catalog-v2-920106-01', '可见的焦点 · 记录', 0, '焦点样式必须在深浅主题中都能看清，而不只是给鼠标悬停状态增加装饰。', '可见的焦点', 10, 0, '记录', 'https://example.com/xray-mock-missing-10-0'),
  (951001, 930101, 'mock-catalog-v2-920106-02', '控件名称 · 记录', 1, '图标按钮需要准确的可访问名称，读屏用户才能分辨每一行对应的操作。', '控件名称', 10, 1, '记录', 'https://example.com/xray-mock-missing-10-1'),
  (951002, 930102, 'mock-catalog-v2-920106-03', '弹窗标题 · 记录', 2, '弹窗提供明确标题与描述，让进入新上下文时知道当前需要完成什么。', '弹窗标题', 10, 2, '记录', 'https://example.com/xray-mock-missing-10-2'),
  (951003, 930100, 'mock-catalog-v2-920106-04', '色彩之外的信息 · 记录', 3, '颜色不能代替名称或状态文本，图例和实际内容应当共同表达含义。', '色彩之外的信息', 10, 3, '记录', 'https://example.com/xray-mock-missing-10-3'),
  (951004, 930101, 'mock-catalog-v2-920106-05', '缩放后的重排 · 记录', 4, '放大页面后允许辅助内容下移，不能通过横向滚动强迫读者寻找主操作。', '缩放后的重排', 10, 4, '记录', 'https://example.com/xray-mock-missing-10-4'),
  (951005, 930102, 'mock-catalog-v2-920106-06', '错误的播报 · 记录', 5, '错误发生后及时播报，但不重复朗读整页，避免打断当前输入。', '错误的播报', 10, 5, '记录', 'https://example.com/xray-mock-missing-10-5'),
  (951006, 930100, 'mock-catalog-v2-920106-07', '触控目标 · 记录', 6, '小图标可以放在足够大的按钮里，视觉轻巧不等于点击区域也要狭小。', '触控目标', 10, 6, '记录', 'https://example.com/xray-mock-missing-10-6'),
  (951007, 930101, 'mock-catalog-v2-920106-08', '列表的结构 · 记录', 7, '相关资料使用真正的列表结构，让用户能够快速判断数量并逐项浏览。', '列表的结构', 10, 7, '记录', 'https://example.com/xray-mock-missing-10-7'),
  (951100, 930110, 'mock-catalog-v2-920107-01', '开场问题 · 记录', 0, '先询问最近一次真实经历，再讨论对假设功能的态度，减少礼貌性肯定。', '开场问题', 11, 0, '记录', 'https://example.com/xray-mock-missing-11-0'),
  (951101, 930111, 'mock-catalog-v2-920107-02', '观察任务过程 · 记录', 1, '用户实际停顿的地方往往比事后总结更有价值，记录动作顺序和犹豫点。', '观察任务过程', 11, 1, '记录', 'https://example.com/xray-mock-missing-11-1'),
  (951102, 930112, 'mock-catalog-v2-920107-03', '招募条件 · 记录', 2, '样本需要覆盖使用频率和经验差异，不能只找最熟悉产品的人。', '招募条件', 11, 2, '记录', 'https://example.com/xray-mock-missing-11-2'),
  (951103, 930110, 'mock-catalog-v2-920107-04', '访谈笔记 · 记录', 3, '区分原话、观察和推断，整理时不要把自己的解释混进用户表达。', '访谈笔记', 11, 3, '记录', 'https://example.com/xray-mock-missing-11-3'),
  (951104, 930111, 'mock-catalog-v2-920107-05', '沉默的价值 · 记录', 4, '提问后给对方足够时间，不要急着用自己的例子补全答案。', '沉默的价值', 11, 4, '记录', 'https://example.com/xray-mock-missing-11-4'),
  (951105, 930112, 'mock-catalog-v2-920107-06', '需求的频率 · 记录', 5, '偶尔出现的痛点和每天发生的问题优先级不同，需要追问时间范围。', '需求的频率', 11, 5, '记录', 'https://example.com/xray-mock-missing-11-5'),
  (951106, 930110, 'mock-catalog-v2-920107-07', '方案验证 · 记录', 6, '让用户完成一项具体任务，比展示页面后询问是否喜欢更容易得到可操作反馈。', '方案验证', 11, 6, '记录', 'https://example.com/xray-mock-missing-11-6'),
  (951107, 930111, 'mock-catalog-v2-920107-08', '研究回访 · 记录', 7, '修改之后再观察原来的任务，确认改善的是问题本身，而不是只换了一种表达。', '研究回访', 11, 7, '记录', 'https://example.com/xray-mock-missing-11-7'),
  (951200, 930120, 'mock-catalog-v2-920108-01', '摘录与转述 · 记录', 0, '摘录保留作者原话，转述写清自己的理解，让两者在笔记中容易区分。', '摘录与转述', 12, 0, '记录', 'https://example.com/xray-mock-missing-12-0'),
  (951201, 930121, 'mock-catalog-v2-920108-02', '文章的第一段 · 记录', 1, '开头交代读者会得到什么，再展开背景，避免用长篇铺垫推迟主题。', '文章的第一段', 12, 1, '记录', 'https://example.com/xray-mock-missing-12-1'),
  (951202, 930122, 'mock-catalog-v2-920108-03', '段落之间的联系 · 记录', 2, '让下一段回应前一段留下的问题，比不断添加连接词更自然。', '段落之间的联系', 12, 2, '记录', 'https://example.com/xray-mock-missing-12-2'),
  (951203, 930120, 'mock-catalog-v2-920108-04', '例子的尺度 · 记录', 3, '用足够具体的小例子解释概念，不让例子本身需要另一篇文章才能理解。', '例子的尺度', 12, 3, '记录', 'https://example.com/xray-mock-missing-12-3'),
  (951204, 930121, 'mock-catalog-v2-920108-05', '删改的顺序 · 记录', 4, '先处理结构与事实，再调整句子节奏，避免为即将删除的段落反复润色。', '删改的顺序', 12, 4, '记录', 'https://example.com/xray-mock-missing-12-4'),
  (951205, 930122, 'mock-catalog-v2-920108-06', '参考资料 · 记录', 5, '保存能支持论点的原始来源，并注明它回答的是哪一个问题。', '参考资料', 12, 5, '记录', 'https://example.com/xray-mock-missing-12-5'),
  (951206, 930120, 'mock-catalog-v2-920108-07', '回读自己的笔记 · 记录', 6, '隔一段时间重新阅读，看看不依赖当时记忆是否仍能理解。', '回读自己的笔记', 12, 6, '记录', 'https://example.com/xray-mock-missing-12-6'),
  (951207, 930121, 'mock-catalog-v2-920108-08', '完成的标准 · 记录', 7, '文章能够准确回答最初的问题，就可以结束，不必为了显得完整继续堆砌内容。', '完成的标准', 12, 7, '记录', 'https://example.com/xray-mock-missing-12-7'),
  (951300, 930130, 'mock-catalog-v2-920109-01', '版本来源 · 记录', 0, '版本号需要一个权威入口，各处展示从同一来源派生，避免发布后显示不一致。', '版本来源', 13, 0, '记录', 'https://example.com/xray-mock-missing-13-0'),
  (951301, 930131, 'mock-catalog-v2-920109-02', '变更说明 · 记录', 1, '围绕用户能观察到的行为写说明，必要时给出触发条件与前后差异。', '变更说明', 13, 1, '记录', 'https://example.com/xray-mock-missing-13-1'),
  (951302, 930132, 'mock-catalog-v2-920109-03', '验证范围 · 记录', 2, '记录实际运行过的检查，把尚未验证的部分单独说明，不把计划当成证据。', '验证范围', 13, 2, '记录', 'https://example.com/xray-mock-missing-13-2'),
  (951303, 930130, 'mock-catalog-v2-920109-04', '回滚准备 · 记录', 3, '发布前明确出现问题时如何恢复，保留上一个可运行版本和必要配置。', '回滚准备', 13, 3, '记录', 'https://example.com/xray-mock-missing-13-3'),
  (951304, 930131, 'mock-catalog-v2-920109-05', '事故时间线 · 记录', 4, '复盘按可证实的事件建立时间线，先还原过程，再讨论改进措施。', '事故时间线', 13, 4, '记录', 'https://example.com/xray-mock-missing-13-4'),
  (951305, 930132, 'mock-catalog-v2-920109-06', '避免重复犯错 · 记录', 5, '把反复出现的错误变成自动检查，比在文档里不断增加提醒更可靠。', '避免重复犯错', 13, 5, '记录', 'https://example.com/xray-mock-missing-13-5'),
  (951306, 930130, 'mock-catalog-v2-920109-07', '交接材料 · 记录', 6, '让接手的人知道修改了什么、如何验证、还有什么没完成，不需要重读整段聊天。', '交接材料', 13, 6, '记录', 'https://example.com/xray-mock-missing-13-6'),
  (951307, 930131, 'mock-catalog-v2-920109-08', '发布后的观察 · 记录', 7, '确认服务真正运行了预期版本，再看关键路径是否稳定，发布命令成功只是开始。', '发布后的观察', 13, 7, '记录', 'https://example.com/xray-mock-missing-13-7')
)
INSERT OR IGNORE INTO channel_articles
  (id,user_id,channel_id,external_id,title,report_date,summary,author,markdown,source_key_id,source_label,created_at_ms)
SELECT r.id,k.user_id,k.channel_id,r.external_id,r.title,date('now','-' || r.age_days || ' days'),r.summary,
  'Mock Editorial Desk',
  replace(replace(replace(replace(replace(replace(f.markdown || p.markdown,
    '{{summary}}',r.summary),'{{topic}}',r.topic),'{{channel}}',t.channel_name),
    '{{url}}',coalesce(t.source_url,'')),'{{source}}',t.source_label),'{{missing}}',r.missing_url),
  k.id,k.label,(unixepoch()-r.age_days*86400)*1000
FROM demo_reports r
JOIN topics t ON t.topic_id=r.topic_id
JOIN formats f ON f.format_id=r.format_id
JOIN phases p ON p.phase=r.phase
JOIN push_tokens k ON k.id=r.key_id AND k.token_hash='mock-only:not-a-sha256:' || r.key_id
WHERE k.user_id='xray-mock-user';

WITH topics(id,name,topic,icon) AS (VALUES
 (960003,'AI 实验室 · 关注','代理评测与工具调用','sparkles'),
 (960004,'前端工程 · 关注','交互与浏览器边界','code'),
 (960005,'数据与存储 · 关注','查询与数据一致性','database'),
 (960006,'云端运行 · 关注','运行时与可观测性','cloud'),
 (960007,'安全与隐私 · 关注','权限与凭据边界','shield'),
 (960008,'无障碍实践 · 关注','键盘与读屏体验','eye'),
 (960009,'产品访谈 · 关注','真实任务与用户反馈','users'),
 (960010,'阅读写作 · 关注','笔记与资料回访','book-open'),
 (960011,'发布复盘 · 关注','交付验证与事故复盘','rocket'),
 (960012,'设计系统 · 关注','控件与视觉层级','palette'),
 (960013,'灵感备忘 · 关注','原型与小实验','lightbulb')
)
INSERT OR IGNORE INTO watchlists (id,user_id,name,description,icon,translate_enabled,created_at_ms)
SELECT id,'xray-mock-user',name,'Mock catalog v3 · ' || topic,icon,0,unixepoch()*1000 FROM topics;

WITH targets AS (
 SELECT *,CASE id WHEN 1 THEN 1 WHEN 2 THEN 2 ELSE id-960000 END AS idx
 FROM watchlists WHERE user_id='xray-mock-user' AND
 ((id=1 AND name='AI & Engineering') OR (id=2 AND name='Design & Reading') OR
 (id BETWEEN 960003 AND 960013 AND description LIKE 'Mock catalog v3 · %'))
), roles(slot,handle,label) AS (VALUES
 (0,'builder','实践者'),(1,'reader','阅读员'),(2,'writer','记录员'),(3,'curator','资料整理员'),
 (4,'notes','研究札记'),(5,'digest','每周摘要'),(6,'lab','实验台'),(7,'review','回访记录')
)
INSERT OR IGNORE INTO watchlist_members
 (id,user_id,watchlist_id,source_type,handle,display_name,note,added_at_ms)
SELECT 9600000+idx*10+slot,user_id,id,CASE WHEN slot<4 THEN 'x.com' ELSE 'custom' END,
 'mx' || printf('%02d',idx) || '_' || handle,
 'Mock · ' || replace(name,' · 关注','') || ' · ' || label,
 'Mock catalog v3 · Fictional source; no live collection credentials.',(unixepoch()-slot*86400)*1000
FROM targets CROSS JOIN roles;

INSERT OR IGNORE INTO groups (id,user_id,name,description,icon,created_at_ms)
SELECT CASE w.id WHEN 1 THEN 1 WHEN 2 THEN 960002 ELSE w.id END,w.user_id,
 replace(w.name,' · 关注','') || ' · 来源库','Mock catalog v3 · Fictional sources for copy and dedup review.',
 w.icon,unixepoch()*1000
FROM watchlists w WHERE w.user_id='xray-mock-user' AND EXISTS
 (SELECT 1 FROM watchlist_members m WHERE m.watchlist_id=w.id AND m.note='Mock catalog v3 · Fictional source; no live collection credentials.');

INSERT OR IGNORE INTO group_members (id,user_id,group_id,source_type,handle,display_name,added_at_ms)
SELECT m.id,m.user_id,g.id,m.source_type,
 CASE WHEN m.id%10<6 THEN m.handle ELSE m.handle || '_group' END,
 m.display_name || CASE WHEN m.id%10<6 THEN '' ELSE ' · 候选来源' END,m.added_at_ms
FROM watchlist_members m JOIN groups g
 ON g.id=CASE m.watchlist_id WHEN 1 THEN 1 WHEN 2 THEN 960002 ELSE m.watchlist_id END AND g.user_id=m.user_id
WHERE m.note='Mock catalog v3 · Fictional source; no live collection credentials.'
 AND ((g.id=1 AND g.name='Builders') OR g.description='Mock catalog v3 · Fictional sources for copy and dedup review.');

WITH labels(slot,name) AS (VALUES (1,'深度阅读'),(2,'研发'),(2,'开源'),(2,'长期跟踪'),
 (4,'每周观察'),(5,'待验证'),(5,'优先关注'),(7,'文档'))
INSERT OR IGNORE INTO watchlist_member_tags (member_id,tag_id)
SELECT m.id,t.id FROM watchlist_members m JOIN labels l ON m.id%10=l.slot
JOIN tags t ON t.user_id=m.user_id AND t.name=l.name
WHERE m.note='Mock catalog v3 · Fictional source; no live collection credentials.';

WITH numbers(n) AS (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15)),
observations(slot,title,body) AS (VALUES
 (0,'先完成一个真实任务','Start with one concrete task. Keep the original input and the observed result together before deciding what to change.'),
 (1,'引用的上下文','A useful quote preserves the question it answered. Read the original source before repeating a conclusion.'),
 (2,'回复中的边界','The happy path is only one sample. Ask what happens when the user cancels, the network stalls, or the input is empty.'),
 (3,'转发与证据','Sharing the original work is better than copying its headline. Credit the author and keep a note about why it matters.'),
 (4,'图像里的信息','A screenshot can reveal alignment and density problems that a checklist misses. Text should still explain the finding.'),
 (5,'动态交互记录','Watch the complete transition: the trigger, the pending state, and the focus destination after the operation ends.'),
 (6,'实验结果回访','An experiment is useful when someone else can repeat it. Record the conditions and distinguish observations from assumptions.'),
 (7,'长篇观察与复盘','Small decisions accumulate. A clear interface is often the result of removing interruptions, preserving context, and making recovery predictable.')
), samples AS (
 SELECT 9700000+(CASE w.id WHEN 1 THEN 1 WHEN 2 THEN 2 ELSE w.id-960000 END)*100+n AS item_id,
 n,m.id AS member_id,m.user_id,w.id AS watchlist_id,m.source_type,m.handle,m.display_name,
 replace(w.name,' · 关注','') AS topic,o.title,o.body,
 (unixepoch()-n*21600)*1000 AS ts,
 CASE (n+w.id)%4 WHEN 0 THEN 'not_requested' WHEN 1 THEN 'pending' WHEN 2 THEN 'succeeded' ELSE 'failed' END AS ai,
 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=960&q=80' AS photo
 FROM watchlists w CROSS JOIN numbers JOIN observations o ON o.slot=n%8
 JOIN watchlist_members m ON m.watchlist_id=w.id AND m.id%10=n%8
 WHERE m.note='Mock catalog v3 · Fictional source; no live collection credentials.' AND w.user_id=m.user_id
), content AS (
 SELECT *,topic || ' · ' || title || char(10) || char(10) || body ||
 CASE WHEN n%8=7 THEN char(10) || char(10) ||
 'A good review begins with the task rather than the screen. Who is trying to finish the work, what do they already know, and what would make the next step obvious? These questions often explain more than a larger collection of controls.' || char(10) || char(10) ||
 'Keep the source material beside your interpretation. When a detail is uncertain, write down the uncertainty instead of turning it into a confident claim. Later readers should be able to tell which parts were observed and which parts still need a test.' || char(10) || char(10) ||
 'After changing the design, repeat the original task. Include a slow network, a long name, and a keyboard-only attempt. A successful click is not the whole story; recovery and the final focus position are part of the result.' ELSE '' END AS text,
 'mock-timeline-v3-' || watchlist_id || '-' || n AS external_id,
 strftime('%Y-%m-%dT%H:%M:%SZ',ts/1000,'unixepoch') AS iso,
 CASE WHEN n%8=6 THEN photo WHEN n%8=5 THEN 'https://github.com/tw93/Kami' ELSE 'https://developers.cloudflare.com/workers/' END AS source_url
 FROM samples
), payloads AS (
 SELECT *,json_object('source_type',source_type,'external_id',external_id,'created_at',iso,
 'author',json_object('id','mock-author-' || member_id,'username',handle,'display_name',display_name),
 'meta',json(CASE WHEN source_type='x.com' AND n%8=3 THEN json_object('is_retweet',json('true'),'retweeted_by',handle) ELSE '{}' END),
 'body',json(CASE WHEN source_type='custom' THEN
 json_object('kind','custom','title',topic || ' · ' || title,'text',text,'url',source_url,
 'tags',json(CASE WHEN n%8=4 THEN '[]' ELSE '["Mock","Reading"]' END))
 ELSE json_object('kind','x.post','tweet',json_patch(
 json_object('id','mock-tweet-' || item_id,'text',text,'author_id','mock-author-' || member_id,'created_at',iso,'lang','en',
 'public_metrics',json_object('like_count',n*7,'retweet_count',n%5,'reply_count',n%4,'quote_count',n%3,'bookmark_count',n*2,'impression_count',100+n*101),
 'entities',json_object('urls',json_array(json_object('start',0,'end',0,'url',source_url,'expanded_url',source_url)),
 'hashtags',json_array(json_object('start',0,'end',0,'tag','Mock')))),
 json_patch(CASE WHEN n%8 IN (1,2) THEN json_object('referenced_tweets',json_array(json_object('type',CASE n%8 WHEN 1 THEN 'quoted' ELSE 'replied_to' END,'id','mock-parent-' || item_id))) ELSE '{}' END,
 CASE WHEN n>=8 THEN json_object('attachments',json_object('media_keys',json_array('mock-media-' || item_id))) ELSE '{}' END)),
 'includes',json_object(
 'users',json_array(json_object('id','mock-parent-author','username','mock_peer','name','Mock · 同行观察员')),
 'tweets',json_array(json_object('id','mock-parent-' || item_id,'author_id','mock-parent-author','text','Keep the original question visible while reviewing the result.','created_at',iso)),
 'media',json(CASE WHEN n>=8 THEN json_array(json_object('media_key','mock-media-' || item_id,
 'type',CASE n%8 WHEN 1 THEN 'video' WHEN 2 THEN 'animated_gif' ELSE 'photo' END,
 'url',CASE WHEN n%8 IN (1,2) THEN 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' ELSE photo END,
 'preview_image_url',photo,'width',960,'height',640)) ELSE '[]' END))) END)) AS payload
 FROM content
)
INSERT OR IGNORE INTO items
 (id,user_id,watchlist_id,source_type,external_id,member_id,author_username,title,text,created_at_ms,ingested_at_ms,
 payload_json,ai_status,ai_status_updated_at_ms,translated_text,summary_text,translation_error,quoted_translated_text)
SELECT item_id,user_id,watchlist_id,source_type,external_id,member_id,handle,
 CASE WHEN source_type='custom' THEN topic || ' · ' || title END,text,ts,ts,payload,ai,ts,
 CASE WHEN ai='succeeded' THEN topic || '：' || title || '。从一个真实任务出发，保留原始资料，记录观察到的结果，并验证取消、重试与边界条件。此翻译为预置 Mock 内容。' END,
 CASE WHEN ai='succeeded' THEN 'Mock 摘要：' || title || '，先保存证据，再验证修改是否解决原来的问题。' END,
 CASE WHEN ai='failed' THEN 'Mock provider timeout; no external AI request was made.' END,
 CASE WHEN ai='succeeded' AND source_type='x.com' AND n%8=1 THEN '复核结果时，始终保留最初的问题。' END
FROM payloads;

WITH runs(n) AS (VALUES (0),(1),(2),(3)), targets AS (
 SELECT DISTINCT w.id,w.user_id,CASE w.id WHEN 1 THEN 1 WHEN 2 THEN 2 ELSE w.id-960000 END AS idx
 FROM watchlists w JOIN watchlist_members m ON m.watchlist_id=w.id AND m.user_id=w.user_id
 WHERE m.note='Mock catalog v3 · Fictional source; no live collection credentials.'
)
INSERT OR IGNORE INTO ingest_logs (id,user_id,watchlist_id,attempted,accepted,deduped,rejected,errors_json,created_at_ms)
SELECT 9800000+idx*10+n,user_id,id,4+n+n+n%2,4+n,n,n%2,
 CASE WHEN n%2=1 THEN '[{"code":"mock_schema_mismatch","message":"Fixture-only rejected sample"}]' END,
 (unixepoch()-n*86400)*1000 FROM targets CROSS JOIN runs;
