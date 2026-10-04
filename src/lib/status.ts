// RLR
// Estatus digital de Video Room — elegante a propósito: pocos elementos, con
// nombre propio, que se ganan haciendo lo que ya se hace aquí (transmitir,
// ver, pagar, cobrar). Dos rangos (uno como creador, otro como espectador)
// que salen de horas reales, y un puñado de reliquias: hitos únicos, con
// fecha, que nadie puede comprar.
import type { Env } from "../env";

export interface Rank {
  code: string;
  name: string;
  /** Umbral en horas para alcanzarlo. */
  hours: number;
  /** Marca sutil que acompaña al nombre en el chat (solo rangos altos). */
  mark?: string;
}

export const CREATOR_RANKS: Rank[] = [
  { code: "nuevo", name: "Nuevo", hours: 0 },
  { code: "al_aire", name: "Al aire", hours: 1 },
  { code: "residente", name: "Residente", hours: 10 },
  { code: "titular", name: "Titular", hours: 50, mark: "◆" },
  { code: "maestro", name: "Maestro", hours: 200, mark: "✦" },
  { code: "leyenda", name: "Leyenda", hours: 1000, mark: "✦✦" },
];

export const VIEWER_RANKS: Rank[] = [
  { code: "curioso", name: "Curioso", hours: 0 },
  { code: "habitual", name: "Habitual", hours: 5 },
  { code: "asiduo", name: "Asiduo", hours: 25, mark: "◆" },
  { code: "mecenas", name: "Mecenas", hours: 100, mark: "✦" },
];

export interface RelicDef {
  code: string;
  name: string;
  icon: string;
  /** Cómo se gana, en una línea — es lo único que se explica. */
  how: string;
  role: "creator" | "viewer";
}

export const RELICS: RelicDef[] = [
  { code: "primera_luz", name: "Primera luz", icon: "🕯️", how: "Tu primera transmisión.", role: "creator" },
  { code: "primer_peso", name: "Primer peso", icon: "🪙", how: "La primera vez que alguien te pagó.", role: "creator" },
  { code: "primer_retiro", name: "Primer retiro", icon: "🏦", how: "Tu primer dinero llegando al banco.", role: "creator" },
  { code: "sala_llena", name: "Sala llena", icon: "🏟️", how: "10 personas viéndote al mismo tiempo.", role: "creator" },
  { code: "casa_llena", name: "Casa llena", icon: "🎪", how: "50 personas viéndote al mismo tiempo.", role: "creator" },
  { code: "maraton", name: "Maratón", icon: "🏃", how: "Tres horas seguidas en vivo.", role: "creator" },
  { code: "constancia", name: "Constancia", icon: "📅", how: "Transmitir 7 días distintos en un mes.", role: "creator" },
  { code: "fundador", name: "Fundador", icon: "🌱", how: "Estar desde el principio (cuenta de 2026).", role: "creator" },
  { code: "primera_entrada", name: "Primera entrada", icon: "🎟️", how: "Tu primera hora en una sala.", role: "viewer" },
  { code: "madrugador", name: "Madrugador", icon: "🌅", how: "Entrar en el primer minuto de una transmisión.", role: "viewer" },
  { code: "primera_propina", name: "Primera propina", icon: "💵", how: "Mandarle dinero a alguien en vivo.", role: "viewer" },
  { code: "generoso", name: "Generoso", icon: "💎", how: "$500 en propinas acumuladas.", role: "viewer" },
  { code: "fiel", name: "Fiel", icon: "🔁", how: "10 entradas a la misma sala.", role: "viewer" },
];
const RELIC_BY_CODE = new Map(RELICS.map((r) => [r.code, r]));
const FOUNDER_CUTOFF = Date.UTC(2027, 0, 1) / 1000;

export function rankFor(ranks: Rank[], hours: number): { current: Rank; next: Rank | null; progress: number } {
  let current = ranks[0];
  for (const r of ranks) if (hours >= r.hours) current = r;
  const idx = ranks.indexOf(current);
  const next = ranks[idx + 1] ?? null;
  const progress = next ? Math.min(1, (hours - current.hours) / (next.hours - current.hours)) : 1;
  return { current, next, progress };
}

export interface EarnedRelic {
  code: string;
  name: string;
  icon: string;
  how: string;
  role: "creator" | "viewer";
  earned_at: number;
}

export interface UserStatus {
  creator: { hours: number; rank: Rank; next: Rank | null; progress: number; sessions: number };
  viewer: { hours: number; rank: Rank; next: Rank | null; progress: number; tips_cents: number };
  relics: EarnedRelic[];
  /** Las que faltan, en el orden en que conviene enseñarlas (pocas). */
  next_relics: RelicDef[];
}

/** Horas en vivo (sesiones terminadas + la abierta, que cuenta máximo 12 h: una sesión olvidada no infla el rango). */
async function creatorHours(env: Env, userId: string): Promise<{ hours: number; sessions: number }> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as n, COALESCE(SUM(MIN(COALESCE(s.ended_at, unixepoch()), s.started_at + 43200) - s.started_at), 0) as secs
     FROM sessions s JOIN rooms r ON r.id = s.room_id WHERE r.owner_id = ?`
  ).bind(userId).first<{ n: number; secs: number }>();
  return { hours: (row?.secs ?? 0) / 3600, sessions: row?.n ?? 0 };
}

/** Horas vistas = entradas pagadas (cada una es una hora), sin contar la propia sala. */
async function viewerHours(env: Env, userId: string): Promise<{ hours: number; tips_cents: number }> {
  const [p, t] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) as n FROM passes p JOIN sessions s ON s.id = p.session_id JOIN rooms r ON r.id = s.room_id
       WHERE p.user_id = ? AND r.owner_id != ?`
    ).bind(userId, userId).first<{ n: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) as c FROM tips WHERE from_user = ?").bind(userId).first<{ c: number }>(),
  ]);
  return { hours: p?.n ?? 0, tips_cents: t?.c ?? 0 };
}

async function earnedRelics(env: Env, userId: string): Promise<EarnedRelic[]> {
  const { results } = await env.DB.prepare("SELECT code, earned_at FROM relics WHERE user_id = ? ORDER BY earned_at ASC").bind(userId).all<{ code: string; earned_at: number }>();
  return results.flatMap((r) => {
    const def = RELIC_BY_CODE.get(r.code);
    return def ? [{ ...def, earned_at: r.earned_at }] : [];
  });
}

async function award(env: Env, userId: string, code: string, sessionId: string | null): Promise<boolean> {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO relics (user_id, code, session_id) VALUES (?, ?, ?)").bind(userId, code, sessionId).run();
  return r.meta.changes > 0;
}

/**
 * Revisa los hechos del usuario y otorga lo que ya se ganó y aún no tenía.
 * Idempotente: se puede llamar en cualquier momento. Devuelve solo lo NUEVO,
 * para enseñarlo en el instante en que ocurre.
 */
export async function evaluateRelics(env: Env, userId: string, ctx: { sessionId?: string | null } = {}): Promise<EarnedRelic[]> {
  const nuevo: EarnedRelic[] = [];
  const sid = ctx.sessionId ?? null;
  try {
    // Todas las lecturas salen en una sola ronda (antes eran ocho viajes en
    // serie); las escrituras (otorgar) son raras y van después, solo si algo
    // se ganó.
    const [haveRows, user, own, allTime, ganancia, retiro, v, t] = await Promise.all([
      env.DB.prepare("SELECT code FROM relics WHERE user_id = ?").bind(userId).all<{ code: string }>(),
      env.DB.prepare("SELECT created_at FROM users WHERE id = ?").bind(userId).first<{ created_at: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) as n, MAX(peak_viewers) as peak,
                MAX(MIN(COALESCE(s.ended_at, unixepoch()), s.started_at + 43200) - s.started_at) as longest,
                COUNT(DISTINCT date(s.started_at - 6*3600, 'unixepoch')) as dias
         FROM sessions s JOIN rooms r ON r.id = s.room_id
         WHERE r.owner_id = ? AND s.started_at >= unixepoch() - 30*86400`
      ).bind(userId).first<{ n: number; peak: number | null; longest: number | null; dias: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) as n, MAX(peak_viewers) as peak, MAX(MIN(COALESCE(s.ended_at, unixepoch()), s.started_at + 43200) - s.started_at) as longest
         FROM sessions s JOIN rooms r ON r.id = s.room_id WHERE r.owner_id = ?`
      ).bind(userId).first<{ n: number; peak: number | null; longest: number | null }>(),
      env.DB.prepare("SELECT 1 FROM ledger WHERE user_id = ? AND type IN ('ganancia_entrada','propina_recibida') LIMIT 1").bind(userId).first(),
      env.DB.prepare("SELECT 1 FROM ledger WHERE user_id = ? AND type = 'retiro' LIMIT 1").bind(userId).first(),
      env.DB.prepare(
        `SELECT COUNT(*) as n,
                MIN(p.purchased_at - s.started_at) as fastest,
                MAX(cnt) as max_same
         FROM passes p JOIN sessions s ON s.id = p.session_id JOIN rooms r ON r.id = s.room_id
         LEFT JOIN (SELECT s2.room_id as rid, COUNT(*) as cnt FROM passes p2 JOIN sessions s2 ON s2.id = p2.session_id WHERE p2.user_id = ? GROUP BY s2.room_id) x ON x.rid = r.id
         WHERE p.user_id = ? AND r.owner_id != ?`
      ).bind(userId, userId, userId).first<{ n: number; fastest: number | null; max_same: number | null }>(),
      env.DB.prepare("SELECT COUNT(*) as n, COALESCE(SUM(amount_cents), 0) as c FROM tips WHERE from_user = ?").bind(userId).first<{ n: number; c: number }>(),
    ]);
    const have = new Set(haveRows.results.map((r) => r.code));
    const dar = async (code: string, gano: boolean, s: string | null) => {
      if (!have.has(code) && gano && (await award(env, userId, code, s))) nuevo.push(withDate(code));
    };

    await dar("fundador", !!user && user.created_at < FOUNDER_CUTOFF, null);

    // --- creador ---
    await dar("primera_luz", (allTime?.n ?? 0) > 0, sid);
    await dar("sala_llena", (allTime?.peak ?? 0) >= 10, sid);
    await dar("casa_llena", (allTime?.peak ?? 0) >= 50, sid);
    await dar("maraton", (allTime?.longest ?? 0) >= 3 * 3600, sid);
    await dar("constancia", (own?.dias ?? 0) >= 7, sid);
    await dar("primer_peso", !!ganancia, sid);
    await dar("primer_retiro", !!retiro, null);

    // --- espectador ---
    await dar("primera_entrada", (v?.n ?? 0) > 0, sid);
    await dar("madrugador", v?.fastest != null && v.fastest >= 0 && v.fastest <= 60, sid);
    await dar("fiel", (v?.max_same ?? 0) >= 10, sid);
    await dar("primera_propina", (t?.n ?? 0) > 0, sid);
    await dar("generoso", (t?.c ?? 0) >= 50000, sid);
  } catch (err) {
    console.error("evaluateRelics", err);
  }
  return nuevo;
}

function withDate(code: string): EarnedRelic {
  return { ...RELIC_BY_CODE.get(code)!, earned_at: Math.floor(Date.now() / 1000) };
}

/** El estatus completo de una persona (para el monedero, la API y la sala). */
export async function statusFor(env: Env, userId: string): Promise<UserStatus> {
  // Otorgar y leer salen a la vez; solo si algo nuevo se ganó (raro) se
  // vuelve a leer la lista. En el caso común, una ronda menos de espera.
  const [nuevo, c, v, relics0] = await Promise.all([evaluateRelics(env, userId), creatorHours(env, userId), viewerHours(env, userId), earnedRelics(env, userId)]);
  const relics = nuevo.length ? await earnedRelics(env, userId) : relics0;
  const cr = rankFor(CREATOR_RANKS, c.hours);
  const vr = rankFor(VIEWER_RANKS, v.hours);
  const have = new Set(relics.map((r) => r.code));
  const isCreator = c.sessions > 0;
  // Las "siguientes" se eligen por rol dominante y se limitan a 3: lo que
  // falta debe sentirse alcanzable, no una pared de candados.
  const next_relics = RELICS.filter((r) => !have.has(r.code) && (isCreator ? r.role === "creator" : r.role === "viewer")).slice(0, 3);
  return {
    creator: { hours: round1(c.hours), rank: cr.current, next: cr.next, progress: cr.progress, sessions: c.sessions },
    viewer: { hours: v.hours, rank: vr.current, next: vr.next, progress: vr.progress, tips_cents: v.tips_cents },
    relics,
    next_relics,
  };
}

/** Lo que se enseña en público (sala, API pública): rango de creador y reliquias ganadas. */
export type PublicStatus = { rank: Rank; hours: number; relics: { code: string; name: string; icon: string }[] };

export async function publicStatusFor(env: Env, userId: string): Promise<PublicStatus> {
  // También aquí se otorga lo pendiente: lo que ya se ganó debe verse en la
  // sala aunque el creador no haya abierto su monedero desde entonces.
  await evaluateRelics(env, userId);
  return publicStatusRead(env, userId);
}

/** Solo lee (dos consultas en paralelo), sin otorgar reliquias pendientes.
 *  Es lo que usa la página de la sala, donde cada milisegundo cuenta: la
 *  evaluación corre aparte, después de responder (waitUntil). */
export async function publicStatusRead(env: Env, userId: string): Promise<PublicStatus> {
  const [c, relics] = await Promise.all([creatorHours(env, userId), earnedRelics(env, userId)]);
  return {
    rank: rankFor(CREATOR_RANKS, c.hours).current,
    hours: round1(c.hours),
    relics: relics.filter((r) => r.role === "creator").map(({ code, name, icon }) => ({ code, name, icon })),
  };
}

/** Marca de rango de espectador para el chat (solo rangos altos tienen). */
export async function viewerMarkFor(env: Env, userId: string): Promise<string | null> {
  const v = await viewerHours(env, userId);
  return rankFor(VIEWER_RANKS, v.hours).current.mark ?? null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
