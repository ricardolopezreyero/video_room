-- Dirección: las pruebas que mandan quienes leen el perfil (/ceo).
CREATE TABLE ceo_postulaciones (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  ciudad TEXT NOT NULL DEFAULT '',
  sala TEXT NOT NULL DEFAULT '',
  enlace TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL,
  siete_dias TEXT NOT NULL,
  correcto TEXT NOT NULL
);
CREATE INDEX idx_ceo_postulaciones_fecha ON ceo_postulaciones(created_at);
