-- Bitácora de links que no se encontraron (o que se adivinaron): es el
-- circuito de aprendizaje del 404. `resuelto` = a dónde se mandó a la persona
-- cuando se adivinó; NULL = se quedó en la página de «no encontramos».
CREATE TABLE enlaces_rotos (
  path TEXT PRIMARY KEY,
  veces INTEGER NOT NULL DEFAULT 1,
  primero INTEGER NOT NULL DEFAULT (unixepoch()),
  ultimo INTEGER NOT NULL DEFAULT (unixepoch()),
  resuelto TEXT
);
CREATE INDEX idx_enlaces_rotos_ultimo ON enlaces_rotos(ultimo);
