-- Audiencia minuto a minuto de cada transmisión: la escribe el Durable Object
-- con una alarma cada 60 s mientras la sala está en vivo. Es lo que permite
-- ver en qué minuto se cae la gente, el promedio real y la curva de cada video.
CREATE TABLE session_samples (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  minute INTEGER NOT NULL,
  viewers INTEGER NOT NULL DEFAULT 0,
  hearts INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, minute)
);

-- Los comentarios se borran al cerrar la sala (son fugaces); el conteo sí
-- se conserva para las estadísticas.
ALTER TABLE sessions ADD COLUMN comments_count INTEGER NOT NULL DEFAULT 0;
