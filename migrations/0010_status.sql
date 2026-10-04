-- Estatus digital. Nada de "puntos" inventados: los rangos se calculan a
-- partir de lo que ya pasó (horas en vivo, horas vistas, dinero), y las
-- reliquias son hitos que se ganan una sola vez y quedan con su fecha.
CREATE TABLE relics (
  user_id TEXT NOT NULL REFERENCES users(id),
  code TEXT NOT NULL,
  earned_at INTEGER NOT NULL DEFAULT (unixepoch()),
  session_id TEXT,
  PRIMARY KEY (user_id, code)
);

-- El resumen de cada transmisión (lo que el Durable Object entrega al
-- terminar) ahora se guarda en la sesión: alimenta reliquias como «Sala
-- llena» y enriquece /api/v1/sessions.
ALTER TABLE sessions ADD COLUMN peak_viewers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN earned_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN hearts INTEGER NOT NULL DEFAULT 0;
