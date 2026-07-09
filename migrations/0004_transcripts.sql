CREATE TABLE session_transcripts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  comment_count INTEGER NOT NULL,
  pdf BLOB NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_transcripts_owner ON session_transcripts(owner_id);
