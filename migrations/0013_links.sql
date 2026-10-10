-- Links estables para siempre: cuando una sala cambia de URL, la anterior
-- queda como alias que sigue llevando a la misma sala (301). Nunca se
-- recicla un slug para otra persona.
CREATE TABLE slug_aliases (
  slug TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  since INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_slug_aliases_room ON slug_aliases(room_id);

-- UTM completos en cada entrada: contenido (dónde estaba el QR) y término.
ALTER TABLE passes ADD COLUMN utm_content TEXT;
ALTER TABLE passes ADD COLUMN utm_term TEXT;
