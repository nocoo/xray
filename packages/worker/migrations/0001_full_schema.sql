-- S4.1: full product schema (docs/03). users already in 0000_users.sql.

CREATE TABLE push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_used_at_ms INTEGER,
  revoked_at_ms INTEGER
);
CREATE INDEX push_tokens_user_idx ON push_tokens(user_id);

CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'eye',
  translate_enabled INTEGER NOT NULL DEFAULT 1 CHECK (translate_enabled IN (0, 1)),
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX watchlists_user_idx ON watchlists(user_id);

CREATE TABLE watchlist_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('x.com', 'custom')),
  external_author_id TEXT,
  handle TEXT NOT NULL,
  display_name TEXT,
  note TEXT,
  added_at_ms INTEGER NOT NULL,
  UNIQUE (watchlist_id, source_type, handle)
);
CREATE INDEX watchlist_members_wl_idx ON watchlist_members(watchlist_id);
CREATE UNIQUE INDEX watchlist_members_ext_uidx
  ON watchlist_members(watchlist_id, source_type, external_author_id)
  WHERE external_author_id IS NOT NULL;

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE watchlist_member_tags (
  member_id INTEGER NOT NULL REFERENCES watchlist_members(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, tag_id)
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'users',
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX groups_user_idx ON groups(user_id);

CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('x.com', 'custom')),
  external_author_id TEXT,
  handle TEXT NOT NULL,
  display_name TEXT,
  added_at_ms INTEGER NOT NULL,
  UNIQUE (group_id, source_type, handle)
);
CREATE INDEX group_members_g_idx ON group_members(group_id);
CREATE UNIQUE INDEX group_members_ext_uidx
  ON group_members(group_id, source_type, external_author_id)
  WHERE external_author_id IS NOT NULL;

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('x.com', 'custom')),
  external_id TEXT NOT NULL,
  member_id INTEGER REFERENCES watchlist_members(id) ON DELETE SET NULL,
  author_username TEXT,
  title TEXT,
  text TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  ingested_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  ai_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (ai_status IN ('not_requested','pending','succeeded','failed')),
  ai_status_updated_at_ms INTEGER NOT NULL DEFAULT 0,
  translated_text TEXT,
  summary_text TEXT,
  translation_error TEXT,
  UNIQUE (watchlist_id, source_type, external_id)
);
CREATE INDEX items_wl_created_idx ON items(watchlist_id, created_at_ms DESC, id DESC);
CREATE INDEX items_user_created_idx ON items(user_id, created_at_ms DESC);
CREATE INDEX items_ai_pending_idx ON items(ai_status, ai_status_updated_at_ms)
  WHERE ai_status = 'pending';

CREATE TABLE ingest_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE SET NULL,
  attempted INTEGER NOT NULL,
  accepted INTEGER NOT NULL,
  deduped INTEGER NOT NULL,
  rejected INTEGER NOT NULL,
  errors_json TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX ingest_logs_wl_idx ON ingest_logs(watchlist_id, created_at_ms DESC, id DESC);

CREATE TABLE settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE ai_configs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT,
  base_url TEXT,
  api_key_ciphertext BLOB NOT NULL,
  api_key_key_version INTEGER NOT NULL DEFAULT 1,
  translation_prompt TEXT,
  summary_prompt TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE integration_secrets (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  meta_json TEXT,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, integration)
);
