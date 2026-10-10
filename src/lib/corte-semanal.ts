// RLR · El corte semanal: los viernes a las 3:33 pm (Ciudad de México), a
// cada creador que tuvo movimiento en los últimos 7 días, un solo correo con
// todo lo que produjo y cómo se compara con la semana anterior. Si no hubo
// movimiento, no hay correo: nunca un correo vacío.
import type { Env } from "../env";
import type { Room, User } from "./db";
import { computeDeepStats } from "./stats-core";
import { corteSemanalEmail, sendEmail } from "./email";
import { quiereDeFila } from "./correos";

const DIA = 86400;

export interface Corte {
  desde: number;
  hasta: number;
  ganado_cents: number;
  ganado_antes_cents: number;
  entradas: number;
  entradas_antes: number;
  personas: number;
  personas_nuevas: number;
  envios: number;
  envios_cents: number;
  membresias_cents: number;
  sesiones: number;
  horas_en_vivo: number;
  pico: number;
  seguidores_nuevos: number;
  seguidores_total: number;
  mejor_dia: { dia: string; cents: number } | null;
  top: { name: string; total_cents: number }[];
  campanas: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; entradas: number; ganado_cents: number }[];
  disponible_cents: number;
}

/** Etiqueta de la semana (viernes de cierre en CDMX), para no mandar dos veces. */
export function etiquetaSemana(hasta: number): string {
  const d = new Date((hasta - 6 * 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

export async function calcularCorte(env: Env, user: User, room: Room, hasta: number): Promise<Corte> {
  const desde = hasta - 7 * DIA;
  const [semana, anterior] = await Promise.all([
    computeDeepStats(env, user, room, desde, hasta),
    computeDeepStats(env, user, room, desde - 7 * DIA, desde - 1),
  ]);
  const k = semana.kpis;
  // Las estadísticas profundas suman entradas y envíos; las membresías van aparte.
  const memb = (d: number, h: number) => env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as total FROM ledger WHERE user_id = ? AND type = 'ganancia_membresia' AND created_at >= ? AND created_at <= ?"
  ).bind(user.id, d, h).first<{ total: number }>().then((r) => r?.total ?? 0);
  const [membresias, membresiasAntes] = await Promise.all([memb(desde, hasta), memb(desde - 7 * DIA, desde - 1)]);
  const mejor = (semana.revenue_by_day as { day: string; entradas_cents: number; propinas_cents: number }[])
    .map((r) => ({ dia: r.day, cents: Number(r.entradas_cents || 0) + Number(r.propinas_cents || 0) }))
    .sort((a, b) => b.cents - a.cents)[0] || null;
  return {
    desde, hasta,
    ganado_cents: k.earned_cents + membresias,
    ganado_antes_cents: anterior.kpis.earned_cents + membresiasAntes,
    entradas: k.entradas,
    entradas_antes: anterior.kpis.entradas,
    personas: k.unique_viewers,
    personas_nuevas: k.new_viewers,
    envios: k.propinas_count,
    envios_cents: k.propinas_cents,
    membresias_cents: membresias,
    sesiones: k.sessions,
    horas_en_vivo: Math.round((k.live_seconds / 3600) * 10) / 10,
    pico: k.peak_viewers,
    seguidores_nuevos: k.followers_new,
    seguidores_total: k.followers_total,
    mejor_dia: mejor && mejor.cents > 0 ? mejor : null,
    top: (semana.top_donors as { name: string; total_cents: number }[]).slice(0, 3),
    campanas: semana.campaigns.slice(0, 3),
    disponible_cents: user.creator_balance_cents,
  };
}

/** Quiénes produjeron algo en la ventana: ganancias en el ledger. */
async function creadoresConMovimiento(env: Env, desde: number, hasta: number): Promise<string[]> {
  const r = await env.DB.prepare(
    "SELECT DISTINCT user_id FROM ledger WHERE amount_cents > 0 AND type IN ('ganancia_entrada','propina_recibida','destacado_recibido','ganancia_membresia') AND created_at >= ? AND created_at <= ?"
  ).bind(desde, hasta).all<{ user_id: string }>();
  return r.results.map((x) => x.user_id);
}

/** Manda los cortes de la semana que termina en `hasta`. Devuelve cuántos salieron. */
export async function enviarCortesSemanales(env: Env, hasta = Math.floor(Date.now() / 1000)): Promise<{ enviados: number; omitidos: number }> {
  const desde = hasta - 7 * DIA;
  const semana = etiquetaSemana(hasta);
  let enviados = 0, omitidos = 0;
  for (const uid of await creadoresConMovimiento(env, desde, hasta)) {
    try {
      const ya = await env.DB.prepare("SELECT 1 FROM cortes_semanales WHERE user_id = ? AND semana = ?").bind(uid, semana).first();
      if (ya) { omitidos++; continue; }
      const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User & { correos: string | null }>();
      const room = user ? await env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(uid).first<Room>() : null;
      if (!user || !room) { omitidos++; continue; }
      if (!quiereDeFila(user.correos, "corte_semanal")) { omitidos++; continue; }
      const corte = await calcularCorte(env, user, room, hasta);
      if (corte.ganado_cents <= 0) { omitidos++; continue; }
      const mail = corteSemanalEmail({ appUrl: env.APP_URL, name: user.name, avatarUrl: user.avatar_url, roomTitle: room.title, corte, ajustesUrl: `${env.APP_URL}/app/monedero#correos` });
      // Se anota antes de mandar: si el envío truena, se reintenta en el
      // siguiente corte, no en un bucle; mejor un corte de menos que dos.
      await env.DB.prepare("INSERT INTO cortes_semanales (user_id, semana, earned_cents) VALUES (?, ?, ?)").bind(uid, semana, corte.ganado_cents).run();
      const ok = await sendEmail(env.RESEND_API_KEY, { to: user.email, ...mail });
      if (ok) enviados++; else omitidos++;
    } catch (err) {
      console.error("corte semanal", uid, err);
      omitidos++;
    }
  }
  return { enviados, omitidos };
}
