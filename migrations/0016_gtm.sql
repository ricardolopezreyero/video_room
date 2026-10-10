-- Go-to-market: el checklist compartido del equipo y quién tiene acceso.
CREATE TABLE gtm_tareas (
  id TEXT PRIMARY KEY,
  hecha_por TEXT NOT NULL,
  hecha_nombre TEXT NOT NULL DEFAULT '',
  hecha_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE gtm_equipo (
  email TEXT PRIMARY KEY,
  agregado_por TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL DEFAULT (unixepoch())
);
