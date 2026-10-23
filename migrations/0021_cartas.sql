-- RLR · Tres cartas de bienvenida: al crear la cuenta, a las 24 h y a las 48 h.
-- cartas = cuántas ya salieron (o se programaron). Las cuentas que ya
-- existían quedan en 3: la serie es solo para quien llega desde hoy.
ALTER TABLE users ADD COLUMN cartas INTEGER;
UPDATE users SET cartas = 3;
