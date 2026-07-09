ALTER TABLE rooms ADD COLUMN slug_assigned_at INTEGER NOT NULL DEFAULT 0;
UPDATE rooms SET slug_assigned_at = created_at WHERE slug_assigned_at = 0;

ALTER TABLE users ADD COLUMN signup_utm_source TEXT;
ALTER TABLE users ADD COLUMN signup_utm_medium TEXT;
ALTER TABLE users ADD COLUMN signup_utm_campaign TEXT;

ALTER TABLE passes ADD COLUMN utm_source TEXT;
ALTER TABLE passes ADD COLUMN utm_medium TEXT;
ALTER TABLE passes ADD COLUMN utm_campaign TEXT;

CREATE TABLE released_slugs (
  slug TEXT PRIMARY KEY,
  released_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
INSERT INTO counters (name, value) VALUES ('room_slug_seq', 0);
