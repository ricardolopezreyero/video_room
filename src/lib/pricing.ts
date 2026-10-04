// RLR
// Todo el dinero del producto pasa por aquí: qué precios existen y cómo se
// reparte cada peso entre creador y plataforma. Una sola fuente, para que la
// sala, el monedero, las estadísticas y la API digan exactamente lo mismo.

/** Precio por hora que puede elegir el creador (centavos MXN). */
export const PRICE_OPTIONS_CENTS = [2000, 5000, 10000, 20000, 50000] as const;
/** Membresía mensual (30 días de acceso ilimitado) — null = no ofrecerla. */
export const MEMBERSHIP_OPTIONS_CENTS = [9900, 19900, 29900, 49900, 99900] as const;
/** Mensaje destacado: la pregunta queda fijada arriba del chat 3 minutos. */
export const HIGHLIGHT_OPTIONS_CENTS = [5000, 10000, 20000] as const;
export const HIGHLIGHT_SECONDS = 180;
/** Propina de despedida: hasta 10 minutos después de terminar la transmisión. */
export const FAREWELL_TIP_WINDOW_SECONDS = 600;
export const MEMBERSHIP_DAYS = 30;

/**
 * Entrada por hora: la plataforma se queda con el 25%, mínimo $10. A $20 la
 * hora el reparto es el de siempre ($10 y $10); de ahí hacia arriba, subir el
 * precio le conviene más al creador que a nosotros — ese es el punto.
 */
export function entrySplit(priceCents: number): { platform: number; creator: number } {
  const platform = Math.max(1000, Math.round(priceCents * 0.25));
  return { platform, creator: priceCents - platform };
}

/** Membresía mensual: 80% para el creador. */
export function membershipSplit(priceCents: number): { platform: number; creator: number } {
  const platform = Math.round(priceCents * 0.2);
  return { platform, creator: priceCents - platform };
}

/** Propinas y mensajes destacados: 90% para el creador. */
export function tipSplit(amountCents: number): { platform: number; creator: number } {
  const creator = Math.round(amountCents * 0.9);
  return { platform: amountCents - creator, creator };
}

export function isPriceOption(c: unknown): c is (typeof PRICE_OPTIONS_CENTS)[number] {
  return (PRICE_OPTIONS_CENTS as readonly number[]).includes(c as number);
}
export function isMembershipOption(c: unknown): c is (typeof MEMBERSHIP_OPTIONS_CENTS)[number] {
  return (MEMBERSHIP_OPTIONS_CENTS as readonly number[]).includes(c as number);
}
export function isHighlightOption(c: unknown): c is (typeof HIGHLIGHT_OPTIONS_CENTS)[number] {
  return (HIGHLIGHT_OPTIONS_CENTS as readonly number[]).includes(c as number);
}
