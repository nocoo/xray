-- S2.3a / XR-03: minimal users table only
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  access_iss TEXT,
  access_sub TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT,
  image TEXT,
  created_at_ms INTEGER NOT NULL,
  CHECK (
    (access_iss IS NULL AND access_sub IS NULL)
    OR (access_iss IS NOT NULL AND access_sub IS NOT NULL)
  ),
  UNIQUE (email)
);

CREATE UNIQUE INDEX users_access_identity_uidx
  ON users(access_iss, access_sub)
  WHERE access_iss IS NOT NULL AND access_sub IS NOT NULL;
