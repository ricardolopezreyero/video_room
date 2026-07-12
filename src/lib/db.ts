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
