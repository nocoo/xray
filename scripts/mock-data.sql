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
