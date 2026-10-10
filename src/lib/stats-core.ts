// RLR
// Las estadísticas del creador se calculan en un solo lugar y las sirven
// igual la pantalla de Estadísticas (sesión) y la API pública (llave).
import type { Env } from "../env";
import type { Room, Session, User } from "./db";

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
  campaigns: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; entradas: number; ganado_cents: number }[];
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
       COALESCE(p.utm_medium, '') as utm_medium,
       COALESCE(p.utm_campaign, '') as utm_campaign,
       COALESCE(p.utm_content, '') as utm_content,
       COUNT(*) as entradas,
       COALESCE(SUM(p.creator_cents), 0) as ganado_cents
     FROM passes p JOIN sessions s ON s.id = p.session_id
     WHERE s.room_id = ? AND p.purchased_at >= ? AND p.user_id != ?
     GROUP BY utm_source, utm_medium, utm_campaign, utm_content
     ORDER BY entradas DESC
     LIMIT 20`
  ).bind(room.id, cutoff, user.id).all<{ utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; entradas: number; ganado_cents: number }>();

  const [entradasByUser, tipsByUser] = await Promise.all([
    env.DB.prepare(
      `SELECT p.user_id as user_id, COUNT(*) as n, COALESCE(SUM(p.amount_cents), 0) as cents
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

// ---------------------------------------------------------------------------
// Estadísticas profundas: rango de fechas libre, todas las transmisiones,
// ingresos por día/hora/día de la semana, curva de audiencia y dónde se cae.
// Todo sale de hechos ya guardados (ledger, passes, tips, sessions, samples).
// ---------------------------------------------------------------------------

const CDMX_OFFSET = -6 * 3600; // México ya no usa horario de verano

export interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  status: string;
  duration_seconds: number;
  entradas: number;
  unique_viewers: number;
  tips_count: number;
  tips_cents: number;
  earned_cents: number;
  peak_viewers: number;
  avg_viewers: number;
  hearts: number;
  comments: number;
  samples: number;
  /** Minuto (relativo al inicio) donde más gente se fue. null si no hay muestras. */
  drop_minute: number | null;
}

export async function computeDeepStats(env: Env, user: User, room: Room, fromTs: number, toTs: number) {
  const [sessionsRes, ledgerByDay, passesRaw, tipsRaw, followersRaw, donors, campaigns] = await Promise.all([
    env.DB.prepare(
      `SELECT s.id, s.started_at, s.ended_at, s.status, s.peak_viewers, s.hearts, s.comments_count,
              (SELECT COUNT(*) FROM passes p WHERE p.session_id = s.id AND p.user_id != ?) as entradas,
              (SELECT COUNT(DISTINCT p.user_id) FROM passes p WHERE p.session_id = s.id AND p.user_id != ?) as unique_viewers,
              (SELECT COUNT(*) FROM tips t WHERE t.session_id = s.id) as tips_count,
              (SELECT COALESCE(SUM(t.amount_cents), 0) FROM tips t WHERE t.session_id = s.id) as tips_cents,
              (SELECT COALESCE(SUM(p.creator_cents), 0) FROM passes p WHERE p.session_id = s.id) as entradas_creator_cents,
              (SELECT COUNT(*) FROM session_samples x WHERE x.session_id = s.id) as samples,
              (SELECT AVG(viewers) FROM session_samples x WHERE x.session_id = s.id) as avg_viewers
       FROM sessions s WHERE s.room_id = ? AND s.started_at >= ? AND s.started_at <= ?
       ORDER BY s.started_at DESC LIMIT 500`
    ).bind(user.id, user.id, room.id, fromTs, toTs).all<{
      id: string; started_at: number; ended_at: number | null; status: string; peak_viewers: number; hearts: number; comments_count: number;
      entradas: number; unique_viewers: number; tips_count: number; tips_cents: number; entradas_creator_cents: number; samples: number; avg_viewers: number | null;
    }>(),
    env.DB.prepare(
      `SELECT date(created_at + ${CDMX_OFFSET}, 'unixepoch') as day,
              SUM(CASE WHEN type = 'ganancia_entrada' THEN amount_cents ELSE 0 END) as entradas_cents,
              SUM(CASE WHEN type = 'propina_recibida' THEN amount_cents ELSE 0 END) as propinas_cents
       FROM ledger WHERE user_id = ? AND type IN ('ganancia_entrada','propina_recibida') AND created_at >= ? AND created_at <= ?
       GROUP BY day ORDER BY day`
    ).bind(user.id, fromTs, toTs).all<{ day: string; entradas_cents: number; propinas_cents: number }>(),
    env.DB.prepare(
      `SELECT p.user_id, p.purchased_at, s.started_at, p.creator_cents
       FROM passes p JOIN sessions s ON s.id = p.session_id
       WHERE s.room_id = ? AND p.user_id != ? AND p.purchased_at >= ? AND p.purchased_at <= ?`
    ).bind(room.id, user.id, fromTs, toTs).all<{ user_id: string; purchased_at: number; started_at: number; creator_cents: number }>(),
    env.DB.prepare(
      "SELECT amount_cents, created_at, message FROM tips WHERE to_user = ? AND created_at >= ? AND created_at <= ?"
    ).bind(user.id, fromTs, toTs).all<{ amount_cents: number; created_at: number; message: string | null }>(),
    env.DB.prepare(
      `SELECT date(created_at + ${CDMX_OFFSET}, 'unixepoch') as day, COUNT(*) as n FROM notify_me WHERE room_id = ? AND created_at <= ? GROUP BY day ORDER BY day`
    ).bind(room.id, toTs).all<{ day: string; n: number }>(),
    computeTopDonors(env, user, room, fromTs),
    env.DB.prepare(
      `SELECT COALESCE(p.utm_source, '(directo)') as utm_source, COALESCE(p.utm_medium, '') as utm_medium,
              COALESCE(p.utm_campaign, '') as utm_campaign, COALESCE(p.utm_content, '') as utm_content,
              COUNT(*) as entradas, COALESCE(SUM(p.creator_cents), 0) as ganado_cents
       FROM passes p JOIN sessions s ON s.id = p.session_id
       WHERE s.room_id = ? AND p.purchased_at >= ? AND p.purchased_at <= ? AND p.user_id != ?
       GROUP BY utm_source, utm_medium, utm_campaign, utm_content ORDER BY entradas DESC LIMIT 20`
    ).bind(room.id, fromTs, toTs, user.id).all<{ utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; entradas: number; ganado_cents: number }>(),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const sessions: SessionRow[] = [];
  for (const s of sessionsRes.results) {
    const end = s.ended_at ?? Math.min(now, s.started_at + 12 * 3600);
    sessions.push({
      id: s.id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      status: s.status,
      duration_seconds: Math.max(0, end - s.started_at),
      entradas: s.entradas,
      unique_viewers: s.unique_viewers,
      tips_count: s.tips_count,
      tips_cents: s.tips_cents,
      earned_cents: s.entradas_creator_cents + Math.round(s.tips_cents * 0.9),
      peak_viewers: s.peak_viewers,
      avg_viewers: Math.round((s.avg_viewers ?? 0) * 10) / 10,
      hearts: s.hearts,
      comments: s.comments_count,
      samples: s.samples,
      drop_minute: null,
    });
  }

  // Curva de retención: para cada sesión con muestras, viewers por minuto
  // normalizado a su pico; luego el promedio por minuto entre sesiones.
  // De ahí sale "el minuto típico de caída" (la mayor bajada del promedio).
  const ids = sessions.filter((s) => s.samples > 0).map((s) => s.id).slice(0, 60);
  let retention: { minute: number; pct: number; sessions: number }[] = [];
  let dropMinute: number | null = null;
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    const { results: samples } = await env.DB.prepare(
      `SELECT session_id, minute, viewers FROM session_samples WHERE session_id IN (${ph}) ORDER BY session_id, minute`
    ).bind(...ids).all<{ session_id: string; minute: number; viewers: number }>();
    const peakBySession = new Map<string, number>();
    for (const r of samples) peakBySession.set(r.session_id, Math.max(peakBySession.get(r.session_id) ?? 0, r.viewers));
    const acc = new Map<number, { sum: number; n: number }>();
    const perSession = new Map<string, { minute: number; viewers: number }[]>();
    for (const r of samples) {
      const peak = peakBySession.get(r.session_id) ?? 0;
      if (peak <= 0) continue;
      const a = acc.get(r.minute) ?? { sum: 0, n: 0 };
      a.sum += r.viewers / peak;
      a.n += 1;
      acc.set(r.minute, a);
      const list = perSession.get(r.session_id) ?? [];
      list.push({ minute: r.minute, viewers: r.viewers });
      perSession.set(r.session_id, list);
    }
    retention = [...acc.entries()]
      .filter(([, a]) => a.n >= Math.max(1, Math.ceil(ids.length * 0.3))) // solo minutos con suficientes sesiones
      .sort((a, b) => a[0] - b[0])
      .map(([minute, a]) => ({ minute, pct: Math.round((a.sum / a.n) * 100), sessions: a.n }));
    let worst = 0;
    for (let i = 1; i < retention.length; i++) {
      const d = retention[i - 1].pct - retention[i].pct;
      if (d > worst) { worst = d; dropMinute = retention[i].minute; }
    }
    for (const s of sessions) {
      const list = perSession.get(s.id);
      if (!list || list.length < 2) continue;
      let w = 0, m: number | null = null;
      for (let i = 1; i < list.length; i++) {
        const d = list[i - 1].viewers - list[i].viewers;
        if (d > w) { w = d; m = list[i].minute; }
      }
      s.drop_minute = m;
    }
  }

  // Por hora del día y día de la semana (CDMX): cuándo entra la gente.
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, entradas: 0, cents: 0 }));
  const byWeekday = Array.from({ length: 7 }, (_, d) => ({ weekday: d, entradas: 0, cents: 0 }));
  const viewerFirst = new Map<string, number>();
  let earlyBirds = 0;
  for (const p of passesRaw.results) {
    const local = new Date((p.purchased_at + CDMX_OFFSET) * 1000);
    byHour[local.getUTCHours()].entradas++; byHour[local.getUTCHours()].cents += p.creator_cents;
    byWeekday[local.getUTCDay()].entradas++; byWeekday[local.getUTCDay()].cents += p.creator_cents;
    viewerFirst.set(p.user_id, Math.min(viewerFirst.get(p.user_id) ?? Infinity, p.purchased_at));
    if (p.purchased_at - p.started_at <= 60) earlyBirds++;
  }
  for (const t of tipsRaw.results) {
    const local = new Date((t.created_at + CDMX_OFFSET) * 1000);
    byHour[local.getUTCHours()].cents += Math.round(t.amount_cents * 0.9);
    byWeekday[local.getUTCDay()].cents += Math.round(t.amount_cents * 0.9);
  }
  // Nuevos vs recurrentes: "nuevo" si su primera entrada de la vida cae en el rango.
  const everBefore = await env.DB.prepare(
    `SELECT DISTINCT p.user_id FROM passes p JOIN sessions s ON s.id = p.session_id WHERE s.room_id = ? AND p.purchased_at < ?`
  ).bind(room.id, fromTs).all<{ user_id: string }>();
  const seenBefore = new Set(everBefore.results.map((r) => r.user_id));
  let newViewers = 0, returning = 0;
  for (const uid of viewerFirst.keys()) (seenBefore.has(uid) ? returning++ : newViewers++);

  const totalEarned = ledgerByDay.results.reduce((a, r) => a + r.entradas_cents + r.propinas_cents, 0);
  const liveSeconds = sessions.reduce((a, s) => a + s.duration_seconds, 0);
  const withSamples = sessions.filter((s) => s.samples > 0);
  const avgViewers = withSamples.length ? withSamples.reduce((a, s) => a + s.avg_viewers, 0) / withSamples.length : 0;
  const topSession = [...sessions].sort((a, b) => b.earned_cents - a.earned_cents || b.peak_viewers - a.peak_viewers)[0] ?? null;
  const tipsWithMessage = tipsRaw.results.filter((t) => t.message && t.message.trim()).length;
  const biggestTip = tipsRaw.results.reduce((a, t) => Math.max(a, t.amount_cents), 0);

  // Seguidores acumulados por día (hasta el fin del rango), recortado al rango.
  let cum = 0;
  const followers = followersRaw.results.map((r) => { cum += r.n; return { day: r.day, total: cum, nuevos: r.n }; });
  const fromDay = new Date((fromTs + CDMX_OFFSET) * 1000).toISOString().slice(0, 10);
  const followersInRange = followers.filter((f) => f.day >= fromDay);

  return {
    range: { from: fromTs, to: toTs },
    kpis: {
      earned_cents: totalEarned,
      entradas: passesRaw.results.length,
      unique_viewers: viewerFirst.size,
      new_viewers: newViewers,
      returning_viewers: returning,
      propinas_count: tipsRaw.results.length,
      propinas_cents: tipsRaw.results.reduce((a, t) => a + t.amount_cents, 0),
      biggest_tip_cents: biggestTip,
      tips_with_message: tipsWithMessage,
      sessions: sessions.length,
      live_seconds: liveSeconds,
      avg_session_seconds: sessions.length ? Math.round(liveSeconds / sessions.length) : 0,
      avg_viewers: Math.round(avgViewers * 10) / 10,
      peak_viewers: sessions.reduce((a, s) => Math.max(a, s.peak_viewers), 0),
      hearts: sessions.reduce((a, s) => a + s.hearts, 0),
      comments: sessions.reduce((a, s) => a + s.comments, 0),
      earned_per_live_hour_cents: liveSeconds > 0 ? Math.round(totalEarned / (liveSeconds / 3600)) : 0,
      early_birds: earlyBirds,
      followers_total: cum,
      followers_new: followersInRange.reduce((a, f) => a + f.nuevos, 0),
    },
    revenue_by_day: ledgerByDay.results,
    by_hour: byHour,
    by_weekday: byWeekday,
    retention,
    drop_minute: dropMinute,
    sessions,
    top_session: topSession,
    followers: followersInRange,
    top_donors: donors,
    campaigns: campaigns.results,
  };
}

async function computeTopDonors(env: Env, user: User, room: Room, cutoff: number) {
  const s = await computeCreatorStats(env, user, room, "all");
  void cutoff;
  return s.top_donors;
}

/** Una transmisión al detalle: muestras por minuto y los momentos (entradas, propinas) sobre esa línea. */
export async function sessionDetail(env: Env, room: Room, sessionId: string) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND room_id = ?").bind(sessionId, room.id).first<Session & { peak_viewers: number; earned_cents: number; hearts: number; comments_count: number }>();
  if (!s) return null;
  const [samples, passes, tips] = await Promise.all([
    env.DB.prepare("SELECT minute, viewers, hearts, comments FROM session_samples WHERE session_id = ? ORDER BY minute").bind(sessionId).all<{ minute: number; viewers: number; hearts: number; comments: number }>(),
    env.DB.prepare("SELECT purchased_at FROM passes WHERE session_id = ? AND user_id != ?").bind(sessionId, room.owner_id).all<{ purchased_at: number }>(),
    env.DB.prepare("SELECT t.amount_cents, t.created_at, t.message, u.name FROM tips t JOIN users u ON u.id = t.from_user WHERE t.session_id = ? ORDER BY t.created_at").bind(sessionId).all<{ amount_cents: number; created_at: number; message: string | null; name: string }>(),
  ]);
  const minuteOf = (ts: number) => Math.max(0, Math.round((ts - s.started_at) / 60));
  return {
    session: s,
    samples: samples.results,
    entradas: passes.results.map((p) => ({ minute: minuteOf(p.purchased_at) })),
    tips: tips.results.map((t) => ({ minute: minuteOf(t.created_at), amount_cents: t.amount_cents, message: t.message, name: t.name })),
  };
}
