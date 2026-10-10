// RLR
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export function isNumericSlug(slug: string): boolean {
  return /^[0-9]+$/.test(slug);
}

// Las salas viven en la raíz del dominio (video.capitaltorreon.com/:slug) — estas
// palabras siguen siendo rutas reales de la app y nunca deben poder asignarse
// como slug de sala, o el link de alguien dejaría de servir su sala.
const RESERVED_SLUGS = new Set([
  // rutas reales de la app
  "app", "api", "auth", "webhook", "webhooks", "ws", "r", "recibo", "login", "logout", "salir", "admin",
  "unsubscribe", "embed", "well-known", "cdn-cgi",
  // páginas que vivieron en la raíz y hoy redirigen a /app/*
  "manifiesto", "faq", "monedero", "estadisticas", "transacciones", "bienvenida", "api-docs", "materiales", "material", "kit", "gtm", "gtm.js",
  // archivos servidos desde public/ (con y sin extensión, por si acaso)
  "sitemap.xml", "robots.txt", "favicon.ico", "index.html", "sitemap", "robots", "favicon", "index",
  "style.css", "room.js", "utm.js", "veloz.js", "sw.js", "chat.js", "embed.js", "motor-video.js", "motor-audio.js", "puente-login.js", "og-default.svg",
  "qr.js", "qr-lib.js", "materiales.js", "materiales-motor.js", "materiales-catalogo.js", "qr", "qr-lib", "materiales-motor", "materiales-catalogo",
  "style", "room", "utm", "veloz", "sw", "chat", "motor-video", "motor-audio", "puente-login", "og-default", "fonts", "img", "static", "assets",
  // palabras que confunden o que un día pueden ser rutas
  "www", "video", "live", "en-vivo", "sala", "salas", "rooms", "room", "me", "yo", "null", "undefined", "true", "false",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Lo que llega en la URL, llevado a su forma canónica: minúsculas, sin
 *  acentos, sin la puntuación que los mensajeros pegan al final de un link
 *  («video.capitaltorreon.com/ricardo.» o «…/ricardo)»), sin codificación.
 *  Si el resultado es distinto de lo que llegó, la ruta redirige (301) a la
 *  forma canónica: así un QR impreso en mayúsculas o un link con un punto
 *  pegado siguen llevando a la sala. */
export function canonicalizarSlug(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* se queda como vino */ }
  s = s.replace(/^[\s(\[{<'"«“‘]+/u, "").replace(/[\s.,;:!?)\]}>'"»”’…]+$/u, "");
  return slugify(s);
}

// Asigna el siguiente slug numérico: avanza el contador global hasta dar con
// un número que nadie haya tenido nunca (ni como sala ni como alias). Un
// número que alguien tuvo no se vuelve a dar jamás: su QR impreso puede
// seguir en la calle años después.
export async function nextAvailableSlug(db: D1Database): Promise<string> {
  for (let i = 0; i < 1000; i++) {
    const row = await db.prepare(
      "UPDATE counters SET value = value + 1 WHERE name = 'room_slug_seq' RETURNING value"
    ).first<{ value: number }>();
    const slug = String(row!.value);
    if (isReservedSlug(slug)) continue;
    const usado = await db.prepare(
      "SELECT 1 FROM rooms WHERE slug = ? UNION SELECT 1 FROM slug_aliases WHERE slug = ? LIMIT 1"
    ).bind(slug, slug).first();
    if (!usado) return slug;
  }
  throw new Error("sin_slug_disponible");
}

/** ¿Ese slug ya es de alguien (sala o alias)? Devuelve el room_id dueño o null. */
export async function duenoDelSlug(db: D1Database, slug: string): Promise<string | null> {
  const r = await db.prepare(
    "SELECT id as room_id FROM rooms WHERE slug = ? UNION SELECT room_id FROM slug_aliases WHERE slug = ? LIMIT 1"
  ).bind(slug, slug).first<{ room_id: string }>();
  return r?.room_id ?? null;
}
