CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  creator_balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  blur_preview INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER,
  status TEXT NOT NULL DEFAULT 'live' -- live|ended
);

CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  purchased_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
);

CREATE TABLE tips (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  from_user TEXT NOT NULL REFERENCES users(id),
  to_user TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL, -- recarga|entrada|renovacion|ganancia_entrada|propina_enviada|propina_recibida|retiro
  ref_id TEXT,
  idem_key TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE raised_hands (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|granted
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE notify_me (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX idx_passes_session_user ON passes(session_id, user_id);
CREATE INDEX idx_ledger_user ON ledger(user_id);
CREATE INDEX idx_comments_session ON comments(session_id);
CREATE INDEX idx_sessions_room ON sessions(room_id);
