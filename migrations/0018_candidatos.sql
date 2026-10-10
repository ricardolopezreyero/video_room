-- Candidatos: las fichas de personas que el equipo salió a buscar para un
-- puesto (hoy: quien dirija Video Room). El contenido de cada ficha vive solo
-- en esta tabla, nunca en el repositorio. `grupo`: 'top' (los elegidos),
-- 'banca' (reserva y los que agrega el equipo) y 'meta' (cómo se hizo la
-- búsqueda de esa vacante, una fila).
CREATE TABLE candidatos (
  id TEXT PRIMARY KEY,
  vacante TEXT NOT NULL DEFAULT 'ceo',
  grupo TEXT NOT NULL DEFAULT 'banca',
  orden INTEGER NOT NULL DEFAULT 100,
  datos TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'por_contactar',
  notas TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER,
  updated_por TEXT
);
CREATE INDEX idx_candidatos_vacante ON candidatos(vacante, grupo, orden);
