-- Monetización flexible. El precio por hora deja de ser fijo: lo elige el
-- creador. Membresía mensual opcional y meta de propinas visible en la sala.
ALTER TABLE rooms ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE rooms ADD COLUMN membership_cents INTEGER;
ALTER TABLE rooms ADD COLUMN tip_goal_cents INTEGER;

-- Cada pase guarda cuánto se pagó y cuánto se quedó el creador (antes era
-- siempre $20 / $10, implícito). Las estadísticas suman estas columnas.
ALTER TABLE passes ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE passes ADD COLUMN creator_cents INTEGER NOT NULL DEFAULT 1000;

-- Un mensaje destacado pagado es una propina con mensaje fijado 3 minutos.
ALTER TABLE tips ADD COLUMN kind TEXT NOT NULL DEFAULT 'tip';

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  price_cents INTEGER NOT NULL,
  creator_cents INTEGER NOT NULL,
  starts_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX memberships_room_user ON memberships(room_id, user_id, expires_at);
