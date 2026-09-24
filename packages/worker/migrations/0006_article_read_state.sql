ALTER TABLE channel_articles ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1));
CREATE INDEX channel_articles_unread_idx ON channel_articles(user_id, channel_id) WHERE is_read = 0;
