export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export interface User {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  balance_cents: number;
  creator_balance_cents: number;
  stripe_connect_account_id: string | null;
  stripe_connect_payouts_enabled: number;
  created_at: number;
  signup_utm_source: string | null;
  signup_utm_medium: string | null;
  signup_utm_campaign: string | null;
}

export interface Room {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  blur_preview: number;
  created_at: number;
  slug_assigned_at: number;
  /** Precio por hora elegido por el creador (centavos). */
  price_cents: number;
  /** Membresía mensual opcional (centavos) — null si no la ofrece. */
  membership_cents: number | null;
  /** Meta de propinas por transmisión (centavos) — null si no hay. */
  tip_goal_cents: number | null;
}

export interface Session {
  id: string;
  room_id: string;
  started_at: number;
  ended_at: number | null;
  status: "live" | "ended";
}

export async function isBlocked(db: D1Database, roomId: string, userId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM blocked_viewers WHERE room_id = ? AND user_id = ?").bind(roomId, userId).first();
  return !!row;
}

export async function isMuted(db: D1Database, roomId: string, userId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM muted_viewers WHERE room_id = ? AND user_id = ?").bind(roomId, userId).first();
  return !!row;
}

/** Lo que una persona puede gastar adentro: lo que recargó más lo que ganó.
 *  Lo ganado se puede gastar o retirar; lo recargado solo se gasta. */
export function gastable(u: { balance_cents: number; creator_balance_cents: number }): number {
  return (u.balance_cents || 0) + (u.creator_balance_cents || 0);
}

/**
 * Cobra `amountCents` del dinero gastable de la persona: primero de lo
 * recargado, el resto de lo ganado. Atómico contra el estado leído: si otro
 * cobro se metió en medio, vuelve a leer y reintenta una vez. Devuelve false
 * si no alcanza o si la llave de idempotencia ya existía.
 */
export async function debitarGastable(
  db: D1Database,
  userId: string,
  amountCents: number,
  type: string,
  refId: string | null,
  idemKey: string
): Promise<boolean> {
  if (amountCents <= 0) return false;
  const existing = await db.prepare("SELECT id FROM ledger WHERE idem_key = ?").bind(idemKey).first();
  if (existing) return false;
  for (let intento = 0; intento < 2; intento++) {
    const u = await db.prepare("SELECT balance_cents, creator_balance_cents FROM users WHERE id = ?").bind(userId).first<{ balance_cents: number; creator_balance_cents: number }>();
    if (!u || gastable(u) < amountCents) return false;
    const deRecarga = Math.min(u.balance_cents, amountCents);
    const deGanado = amountCents - deRecarga;
    const r = await db.prepare(
      "UPDATE users SET balance_cents = balance_cents - ?, creator_balance_cents = creator_balance_cents - ? WHERE id = ? AND balance_cents = ? AND creator_balance_cents = ?"
    ).bind(deRecarga, deGanado, userId, u.balance_cents, u.creator_balance_cents).run();
    if (r.meta.changes === 1) {
      await db.prepare(
        "INSERT INTO ledger (id, user_id, amount_cents, type, ref_id, idem_key) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(newId("ldg"), userId, -amountCents, type, refId, idemKey).run();
      return true;
    }
  }
  return false;
}

export async function creditLedger(
  db: D1Database,
  userId: string,
  amountCents: number,
  type: string,
  refId: string | null,
  idemKey: string,
  balanceField: "balance_cents" | "creator_balance_cents" = "balance_cents"
): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM ledger WHERE idem_key = ?").bind(idemKey).first();
  if (existing) return false;
  await db.batch([
    db.prepare(
      "INSERT INTO ledger (id, user_id, amount_cents, type, ref_id, idem_key) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId("ldg"), userId, amountCents, type, refId, idemKey),
    db.prepare(`UPDATE users SET ${balanceField} = ${balanceField} + ? WHERE id = ?`).bind(amountCents, userId),
  ]);
  return true;
}
