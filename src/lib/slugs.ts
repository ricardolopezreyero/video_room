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

// Las salas viven en la raíz del dominio (videoroom.live/:slug) — estas
// palabras siguen siendo rutas reales de la app y nunca deben poder asignarse
// como slug de sala, o el link de alguien dejaría de servir su sala.
const RESERVED_SLUGS = new Set([
  "app", "api", "auth", "webhook", "webhooks", "ws", "r",
  "unsubscribe", "login", "logout", "admin",
  "sitemap.xml", "robots.txt", "favicon.ico",
  "style.css", "room.js", "utm.js", "og-default.svg",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

// Asigna el siguiente slug numérico disponible: primero reutiliza uno liberado
// (el más antiguo), y si no hay, avanza el contador global.
export async function nextAvailableSlug(db: D1Database): Promise<string> {
  const released = await db.prepare(
    "SELECT slug FROM released_slugs ORDER BY released_at ASC LIMIT 1"
  ).first<{ slug: string }>();

  if (released) {
    await db.prepare("DELETE FROM released_slugs WHERE slug = ?").bind(released.slug).run();
    return released.slug;
  }

  const row = await db.prepare(
    "UPDATE counters SET value = value + 1 WHERE name = 'room_slug_seq' RETURNING value"
  ).first<{ value: number }>();
  return String(row!.value);
}
