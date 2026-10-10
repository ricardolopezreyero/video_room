// RLR
// Todo el dinero del producto pasa por aquí: qué precios existen y cómo se
// reparte cada peso entre creador y plataforma. Una sola fuente, para que la
// sala, el monedero, las estadísticas y la API digan exactamente lo mismo.
//
// Tres capas, una regla por capa (revisión 10-oct-2026):
//  1. La puerta (entrada por hora y membresía): la casa se queda 1 de cada 5
//     pesos. Es lo único que monetizamos.
//  2. El gesto (dinero que la gente manda adentro): llega completo. 0 %.
//     Que el dinero circule adentro no nos cuesta casi nada y vale muchísimo
//     en confianza: «cada peso que mandas, llega».
//  3. La salida (retiro al banco): sin comisión nuestra; mínimo $10 porque es
//     el piso de Stripe. Lo ganado también se puede gastar adentro sin retirar.

/** Precio por hora que puede elegir el creador (centavos MXN). */
export const PRICE_OPTIONS_CENTS = [2000, 5000, 10000, 20000, 50000] as const;
/** Membresía mensual (30 días de acceso ilimitado) — null = no ofrecerla. */
export const MEMBERSHIP_OPTIONS_CENTS = [9900, 19900, 29900, 49900, 99900] as const;
/** Montos rápidos para mandar dinero adentro; también se acepta «otro». */
export const TIP_OPTIONS_CENTS = [2000, 5000, 10000, 20000] as const;
export const TIP_MIN_CENTS = 1000;
export const TIP_MAX_CENTS = 500000;
/** Recargas de saldo (Stripe Checkout). */
export const RECHARGE_OPTIONS_CENTS = [5000, 10000, 20000, 50000, 100000] as const;
/** Un mensaje que acompaña a un envío de dinero queda fijado arriba del chat este tiempo, gratis. */
export const TIP_PIN_SECONDS = 60;
/** Propina de despedida: hasta 10 minutos después de terminar la transmisión. */
export const FAREWELL_TIP_WINDOW_SECONDS = 600;
export const MEMBERSHIP_DAYS = 30;

/** La casa en la puerta: 1 de cada 5 pesos (20 %), sin mínimos escondidos. */
export const PLATFORM_DOOR_SHARE = 0.2;

export function entrySplit(priceCents: number): { platform: number; creator: number } {
  const platform = Math.round(priceCents * PLATFORM_DOOR_SHARE);
  return { platform, creator: priceCents - platform };
}

export function membershipSplit(priceCents: number): { platform: number; creator: number } {
  const platform = Math.round(priceCents * PLATFORM_DOOR_SHARE);
  return { platform, creator: priceCents - platform };
}

/** Lo que la gente manda adentro llega completo. */
export function tipSplit(amountCents: number): { platform: number; creator: number } {
  return { platform: 0, creator: amountCents };
}

export function isPriceOption(c: unknown): c is (typeof PRICE_OPTIONS_CENTS)[number] {
  return (PRICE_OPTIONS_CENTS as readonly number[]).includes(c as number);
}
export function isMembershipOption(c: unknown): c is (typeof MEMBERSHIP_OPTIONS_CENTS)[number] {
  return (MEMBERSHIP_OPTIONS_CENTS as readonly number[]).includes(c as number);
}
export function isRechargeOption(c: unknown): c is (typeof RECHARGE_OPTIONS_CENTS)[number] {
  return (RECHARGE_OPTIONS_CENTS as readonly number[]).includes(c as number);
}
export function isTipAmount(c: unknown): c is number {
  return Number.isInteger(c) && (c as number) >= TIP_MIN_CENTS && (c as number) <= TIP_MAX_CENTS && (c as number) % 100 === 0;
}
