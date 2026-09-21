-- Channels: Markdown report ingestion (docs/11-channels.md)

CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX channels_user_idx ON channels(user_id);

CREATE TABLE channel_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  report_date TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  markdown TEXT NOT NULL,
  source_key_id INTEGER NOT NULL REFERENCES push_tokens(id) ON DELETE CASCADE,
  source_label TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE (channel_id, external_id)
);
CREATE INDEX channel_articles_channel_sort_idx
  ON channel_articles(channel_id, report_date DESC, id DESC);

ALTER TABLE push_tokens ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE;
CREATE INDEX push_tokens_channel_idx ON push_tokens(channel_id);
