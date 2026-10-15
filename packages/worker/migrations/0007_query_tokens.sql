ALTER TABLE push_tokens ADD COLUMN query_access TEXT
  CHECK (query_access IS NULL OR (json_valid(query_access) AND channel_id IS NULL));

ALTER TABLE push_tokens ADD COLUMN query_cursor_key TEXT;

CREATE INDEX channel_articles_user_report_idx
  ON channel_articles(user_id, report_date, id);
