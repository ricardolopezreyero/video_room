// RLR · UTM: de dónde vino cada persona. Se capturan al abrir el link de la
// sala (en el servidor, sin depender de JS) y se guardan 30 días en una
// cookie junto con el slug de la sala: la atribución es POR SALA. Si alguien
// llegó a /ana con ?utm_source=qr y luego entra a /juan, la entrada de Juan
// no se le cuelga al QR de Ana.
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

export const UTM_COOKIE = "vr_utm";
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

const limpiar = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);

/** Los UTM que vienen en la query de esta petición, o null si no hay ninguno. */
export function utmDeQuery(c: Context): Utm | null {
  const utm: Utm = {};
  let hay = false;
  for (const k of UTM_KEYS) {
    const v = limpiar(c.req.query(k));
    if (v) { utm[k] = v; hay = true; }
  }
  // Alias corto para links que se ven («…/ana?de=whatsapp»): es la fuente.
  const de = limpiar(c.req.query("de"));
  if (de && !utm.utm_source) { utm.utm_source = de; if (!utm.utm_medium) utm.utm_medium = "link"; hay = true; }
  return hay ? utm : null;
}

export function guardarUtm(c: Context, utm: Utm, slug: string | null): void {
  setCookie(c, UTM_COOKIE, JSON.stringify({ ...utm, slug: slug ?? "" }), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "Lax" });
}

/** Lee los UTM guardados. Con `slug`, solo valen si se capturaron en esa
 *  sala (o si son viejos, sin sala anotada). */
export function readUtmCookie(c: Context, slug?: string): Utm {
  const raw = getCookie(c, UTM_COOKIE);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (slug && typeof parsed.slug === "string" && parsed.slug && parsed.slug !== slug) return {};
    const utm: Utm = {};
    for (const k of UTM_KEYS) { const v = limpiar(parsed[k]); if (v) utm[k] = v; }
    return utm;
  } catch {
    return {};
  }
}
