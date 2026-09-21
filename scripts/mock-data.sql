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
