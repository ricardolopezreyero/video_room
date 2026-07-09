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
  created_at: number;
}

export interface Room {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  blur_preview: number;
  created_at: number;
}

export interface Session {
  id: string;
  room_id: string;
  started_at: number;
  ended_at: number | null;
  status: "live" | "ended";
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
