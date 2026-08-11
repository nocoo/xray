-- Applied only in L2/L3 local persist dirs — never production migrations.
CREATE TABLE IF NOT EXISTS _test_marker (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR REPLACE INTO _test_marker (key, value) VALUES ('env', 'test');
