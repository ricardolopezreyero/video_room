-- Go-to-market: bitácora de palomitas. Cada vez que alguien marca o desmarca
-- una tarea queda quién (su correo), qué y a qué hora. También entra cuando
-- los números reales alcanzan un punto de control (por = 'sistema').
CREATE TABLE gtm_bitacora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tarea TEXT NOT NULL,
  hecha INTEGER NOT NULL,
  por TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_gtm_bitacora_at ON gtm_bitacora(at);
