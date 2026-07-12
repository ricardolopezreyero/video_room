// RLR
import { Hono } from "hono";
import { getDailyPhrase } from "../lib/phrases";
import type { Env } from "../env";

export const phrase = new Hono<{ Bindings: Env }>();

// Misma frase para todos, sin sesión — cambia sola cada día a las 3:33pm CDMX.
phrase.get("/api/phrase", (c) => {
  return c.json({ text: getDailyPhrase() });
});
