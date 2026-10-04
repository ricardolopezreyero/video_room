// RLR
// Las estadísticas del creador se calculan en un solo lugar y las sirven
// igual la pantalla de Estadísticas (sesión) y la API pública (llave).
import type { Env } from "../env";
import type { Room, User } from "./db";

export const STAT_RANGES: Record<string, number> = {
  today: 60 * 60 * 24,
  "7d": 60 * 60 * 24 * 7,
  "30d": 60 * 60 * 24 * 30,
  all: Infinity,
};

interface Donor {
  user_id: string;
  entradas_n: number;
  entradas_cents: number;
  propinas_n: number;
  propinas_cents: number;
}

export interface CreatorStats {
  has_room: true;
  room_slug: string;
  balance_cents: number;
  creator_balance_cents: number;
  total_earned_all_time_cents: number;
  period: {
    range: string;
    earned_cents: number;
    entradas_count: number;
    unique_viewers: number;
    propinas_count: number;
    propinas_cents: number;
  };
  top_donors: { user_id: string; name: string; avatar_url: string | null; total_cents: number; entradas: number; propinas: number }[];
  campaigns: { utm_source: string; utm_campaign: string; entradas: number; ganado_cents: number }[];
}

export async function computeCreatorStats(env: Env, user: User, room: Room, rangeParam: string): Promise<CreatorStats> {
  const seconds = STAT_RANGES[rangeParam] ?? STAT_RANGES["30d"];
  const range = STAT_RANGES[rangeParam] ? rangeParam : "30d";
  const now = Math.floor(Date.now() / 1000);
  const cutoff = seconds === Infinity ? 0 : now - seconds;

  const [totalEarned, periodEarned, tipStats, viewerStats] = await Promise.all([
    env.DB.prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) as total FROM ledger WHERE user_id = ? AND type IN ('ganancia_entrada','propina_recibida')"
    ).bind(user.id).first<{ total: number }>(),
    env.DB.prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) as total FROM ledger WHERE user_id = ? AND type IN ('ganancia_entrada','propina_recibida') AND created_at >= ?"
    ).bind(user.id, cutoff).first<{ total: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) as n, COALESCE(SUM(amount_cents), 0) as total FROM tips WHERE to_user = ? AND created_at >= ?"
    ).bind(user.id, cutoff).first<{ n: number; total: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) as n, COUNT(DISTINCT p.user_id) as unique_viewers
       FROM passes p JOIN sessions s ON s.id = p.session_id
       WHERE s.room_id = ? AND p.purchased_at >= ? AND p.user_id != ?`
    ).bind(room.id, cutoff, user.id).first<{ n: number; unique_viewers: number }>(),
  ]);

  const campaignsRes = await env.DB.prepare(
    `SELECT
       COALESCE(p.utm_source, '(directo)') as utm_source,
       COALESCE(p.utm_campaign, '') as utm_campaign,
       COUNT(*) as entradas,
       COUNT(*) * 1000 as ganado_cents
     FROM passes p JOIN sessions s ON s.id = p.session_id
     WHERE s.room_id = ? AND p.purchased_at >= ? AND p.user_id != ?
     GROUP BY utm_source, utm_campaign
     ORDER BY entradas DESC
     LIMIT 10`
  ).bind(room.id, cutoff, user.id).all<{ utm_source: string; utm_campaign: string; entradas: number; ganado_cents: number }>();

  const [entradasByUser, tipsByUser] = await Promise.all([
    env.DB.prepare(
      `SELECT p.user_id as user_id, COUNT(*) as n, COUNT(*) * 2000 as cents
       FROM passes p JOIN sessions s ON s.id = p.session_id
       WHERE s.room_id = ? AND p.purchased_at >= ? AND p.user_id != ?
       GROUP BY p.user_id`
    ).bind(room.id, cutoff, user.id).all<{ user_id: string; n: number; cents: number }>(),
    env.DB.prepare(
      "SELECT from_user as user_id, COUNT(*) as n, COALESCE(SUM(amount_cents), 0) as cents FROM tips WHERE to_user = ? AND created_at >= ? GROUP BY from_user"
    ).bind(user.id, cutoff).all<{ user_id: string; n: number; cents: number }>(),
  ]);

  const donors = new Map<string, Donor>();
  for (const row of entradasByUser.results) {
    donors.set(row.user_id, { user_id: row.user_id, entradas_n: row.n, entradas_cents: row.cents, propinas_n: 0, propinas_cents: 0 });
  }
  for (const row of tipsByUser.results) {
    const existing = donors.get(row.user_id);
    if (existing) {
      existing.propinas_n = row.n;
      existing.propinas_cents = row.cents;
    } else {
      donors.set(row.user_id, { user_id: row.user_id, entradas_n: 0, entradas_cents: 0, propinas_n: row.n, propinas_cents: row.cents });
    }
  }

  const topDonorIds = [...donors.values()]
    .sort((a, b) => b.entradas_cents + b.propinas_cents - (a.entradas_cents + a.propinas_cents))
    .slice(0, 10);

  let topDonors: CreatorStats["top_donors"] = [];
  if (topDonorIds.length > 0) {
    const placeholders = topDonorIds.map(() => "?").join(",");
    const namesRes = await env.DB.prepare(
      `SELECT id, name, avatar_url FROM users WHERE id IN (${placeholders})`
    ).bind(...topDonorIds.map((d) => d.user_id)).all<{ id: string; name: string; avatar_url: string | null }>();
    const namesById = new Map(namesRes.results.map((u) => [u.id, u]));
    topDonors = topDonorIds.map((d) => ({
      user_id: d.user_id,
      name: namesById.get(d.user_id)?.name ?? "Alguien",
      avatar_url: namesById.get(d.user_id)?.avatar_url ?? null,
      total_cents: d.entradas_cents + d.propinas_cents,
      entradas: d.entradas_n,
      propinas: d.propinas_n,
    }));
  }

  return {
    has_room: true,
    room_slug: room.slug,
    balance_cents: user.balance_cents,
    creator_balance_cents: user.creator_balance_cents,
    total_earned_all_time_cents: totalEarned?.total ?? 0,
    period: {
      range,
      earned_cents: periodEarned?.total ?? 0,
      entradas_count: viewerStats?.n ?? 0,
      unique_viewers: viewerStats?.unique_viewers ?? 0,
      propinas_count: tipStats?.n ?? 0,
      propinas_cents: tipStats?.total ?? 0,
    },
    top_donors: topDonors,
    campaigns: campaignsRes.results,
  };
}
