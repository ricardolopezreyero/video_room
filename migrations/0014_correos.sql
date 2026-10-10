-- Qué correos quiere cada persona (JSON {clave:false} con solo los apagados;
-- NULL = todos prendidos) y el registro del corte semanal para no mandarlo dos veces.
ALTER TABLE users ADD COLUMN correos TEXT;
CREATE TABLE cortes_semanales (
  user_id TEXT NOT NULL REFERENCES users(id),
  semana TEXT NOT NULL,
  sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
  earned_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, semana)
);
