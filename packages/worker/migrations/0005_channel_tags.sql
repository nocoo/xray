CREATE TABLE channel_tags (
 channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
 tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY (channel_id, tag_id)
);
CREATE TABLE channel_key_tags (
 key_id INTEGER NOT NULL REFERENCES push_tokens(id) ON DELETE CASCADE,
 tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY (key_id, tag_id)
);
CREATE INDEX channel_tags_tag_idx ON channel_tags(tag_id);
CREATE INDEX channel_key_tags_tag_idx ON channel_key_tags(tag_id);
