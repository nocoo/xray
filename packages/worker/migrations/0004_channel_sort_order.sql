ALTER TABLE channels ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE channels SET sort_order = (
  SELECT COUNT(*) FROM channels preceding
  WHERE preceding.user_id = channels.user_id AND preceding.id < channels.id
);
CREATE INDEX channels_user_sort_idx ON channels(user_id, sort_order, id);
