-- Llaves de API por usuario: solo se guarda el hash (SHA-256) de la llave;
-- el valor completo se enseña una sola vez al crearla. `prefix` es lo que se
-- muestra en la lista para reconocerla (vr_live_ab12…).
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX api_keys_user ON api_keys(user_id);

-- Webhooks salientes: a dónde avisamos cuando pasa algo en la sala de un
-- usuario. `events` es una lista separada por comas o '*' para todos. Cada
-- entrega va firmada con HMAC-SHA256 de `secret` (ver src/lib/webhooks.ts).
CREATE TABLE webhook_endpoints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '*',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_delivered_at INTEGER,
  last_status INTEGER,
  last_error TEXT
);
CREATE INDEX webhook_endpoints_user ON webhook_endpoints(user_id);
