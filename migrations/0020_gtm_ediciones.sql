-- Go-to-market: lo que quien dirige le cambia a una tarea, sin tocar el plan
-- escrito en el código. Una fila por tarea tocada. Los campos de texto y
-- etiquetas en NULL quieren decir «como viene en el plan». `bloque` es el id
-- de la primera tarea del bloque donde quedó y `pos` su lugar ahí. Archivada:
-- se queda a la vista, apagada, y deja de contar.
CREATE TABLE gtm_ediciones (
  id TEXT PRIMARY KEY,
  titulo TEXT,
  detalle TEXT,
  area TEXT,
  quien TEXT,
  esfuerzo INTEGER,
  ritmo TEXT,
  editada_por TEXT,
  editada_at INTEGER,
  bloque TEXT,
  pos REAL,
  movida_por TEXT,
  movida_at INTEGER,
  archivada INTEGER NOT NULL DEFAULT 0,
  archivada_por TEXT,
  archivada_at INTEGER,
  motivo TEXT
);
-- La bitácora ya no guarda solo palomitas: también editar, archivar, regresar
-- y mover. `accion` en NULL es una fila vieja (se lee de `hecha`).
ALTER TABLE gtm_bitacora ADD COLUMN accion TEXT;
ALTER TABLE gtm_bitacora ADD COLUMN nota TEXT;
