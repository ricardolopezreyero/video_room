// RLR · Go-to-market: los indicadores en vivo.
//
// Todo lo que sale aquí se calcula en el momento con lo que pasó en la
// aplicación: registros, salas, sesiones, entradas, membresías, envíos,
// recargas y retiros. Nadie captura nada. Es lo que se revisa en la junta
// mensual: cómo va este mes contra el anterior, la tendencia, el embudo y de
// dónde llega la gente. Los meses se cortan con la hora de Ciudad de México.
import type { Env } from "../env";

const CDMX = 6 * 3600;
const GAN = "('ganancia_entrada','propina_recibida','destacado_recibido','ganancia_membresia')";
const M = (campo: string) => `strftime('%Y-%m', ${campo} - ${CDMX}, 'unixepoch')`;

export interface MesGtm {
  mes: string; creadores: number; pagan: number; puerta_cents: number; casa_cents: number; envios_cents: number;
  entradas: number; membresias: number; sesiones: number; sesiones_pagadas: number; salas_transmitieron: number;
  salas_nuevas: number; registros: number; recargas_cents: number; retiros_cents: number;
}
export interface IndicadoresGtm {
  generado: number; mes: string; dia: number; dias_mes: number; meses: MesGtm[];
  embudo: { registros: number; salas: number; transmitieron: number; cobraron: number; base7: number; si7: number; base30: number; si30: number; primer_peso_n: number; primer_peso_dias: number | null; espectador_a_creador: number };
  fuentes: { fuente: string; total: number; mes: number; cobran: number }[];
  top: { slug: string; titulo: string; puerta_cents: number; entradas: number; sesiones: number }[];
}

// Varios del equipo viendo la página al mismo tiempo no repiten las consultas.
let cache: { at: number; v: IndicadoresGtm } | null = null;

export async function indicadoresGtm(env: Env, fresco = false): Promise<IndicadoresGtm> {
  const ahoraMs = Date.now(), ahora = Math.floor(ahoraMs / 1000);
  if (!fresco && cache && ahoraMs - cache.at < 20000) return cache.v;
  const d = new Date((ahora - CDMX) * 1000), Y = d.getUTCFullYear(), Mo = d.getUTCMonth();
  const inicio = (k: number) => Math.floor(Date.UTC(Y, Mo - k, 1) / 1000) + CDMX;
  const desde = inicio(5), inicioMes = inicio(0);
  const clave = (k: number) => { const x = new Date(Date.UTC(Y, Mo - k, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
  const todos = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<T>().then((r) => r.results).catch((err) => { console.error("indicador", err); return [] as T[]; });
  const uno = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>().catch((err) => { console.error("indicador", err); return null; });

  const [pases, memb, pagan, envios, libro, ses, salas, usuarios, emb, siete, treinta, peso, e2c, fuentes, top] = await Promise.all([
    todos<{ m: string; g: number; casa: number; n: number; ses: number }>(`SELECT ${M("purchased_at")} m, SUM(amount_cents) g, SUM(amount_cents - creator_cents) casa, COUNT(*) n, COUNT(DISTINCT session_id) ses FROM passes WHERE purchased_at >= ? AND amount_cents > 0 GROUP BY m`, desde),
    todos<{ m: string; g: number; casa: number; n: number }>(`SELECT ${M("created_at")} m, SUM(price_cents) g, SUM(price_cents - creator_cents) casa, COUNT(*) n FROM memberships WHERE created_at >= ? GROUP BY m`, desde),
    todos<{ m: string; n: number }>(`SELECT m, COUNT(DISTINCT user_id) n FROM (SELECT ${M("purchased_at")} m, user_id FROM passes WHERE purchased_at >= ?1 AND amount_cents > 0 UNION SELECT ${M("created_at")} m, user_id FROM memberships WHERE created_at >= ?1) GROUP BY m`, desde),
    todos<{ m: string; g: number }>(`SELECT ${M("created_at")} m, SUM(amount_cents) g FROM tips WHERE created_at >= ? GROUP BY m`, desde),
    todos<{ m: string; creadores: number; recargas: number; retiros: number }>(`SELECT ${M("created_at")} m, COUNT(DISTINCT CASE WHEN type IN ${GAN} AND amount_cents > 0 THEN user_id END) creadores, SUM(CASE WHEN type = 'recarga' THEN amount_cents ELSE 0 END) recargas, SUM(CASE WHEN type = 'retiro' THEN -amount_cents ELSE 0 END) retiros FROM ledger WHERE created_at >= ? GROUP BY m`, desde),
    todos<{ m: string; n: number; salas: number }>(`SELECT ${M("started_at")} m, COUNT(*) n, COUNT(DISTINCT room_id) salas FROM sessions WHERE started_at >= ? GROUP BY m`, desde),
    todos<{ m: string; n: number }>(`SELECT ${M("created_at")} m, COUNT(*) n FROM rooms WHERE created_at >= ? GROUP BY m`, desde),
    todos<{ m: string; n: number }>(`SELECT ${M("created_at")} m, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY m`, desde),
    uno<{ registros: number; salas: number; transmitieron: number; cobraron: number }>("SELECT (SELECT COUNT(*) FROM users) registros, (SELECT COUNT(*) FROM rooms) salas, (SELECT COUNT(DISTINCT room_id) FROM sessions) transmitieron, (SELECT COUNT(DISTINCT s.room_id) FROM passes p JOIN sessions s ON s.id = p.session_id WHERE p.amount_cents > 0) cobraron"),
    // De las salas creadas en los últimos 90 días (y con al menos 7 de vida), cuántas transmitieron en su primera semana.
    uno<{ base: number; si: number }>("SELECT COUNT(*) base, COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM sessions s WHERE s.room_id = r.id AND s.started_at <= r.created_at + 604800) THEN 1 ELSE 0 END),0) si FROM rooms r WHERE r.created_at <= ?1 AND r.created_at >= ?2", ahora - 7 * 86400, ahora - 97 * 86400),
    // De las salas cuya primera sesión fue hace más de 30 días, cuántas volvieron a transmitir dentro de esos 30.
    uno<{ base: number; si: number }>("WITH p AS (SELECT room_id, MIN(started_at) f FROM sessions GROUP BY room_id) SELECT COUNT(*) base, COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM sessions s WHERE s.room_id = p.room_id AND s.started_at > p.f AND s.started_at <= p.f + 2592000) THEN 1 ELSE 0 END),0) si FROM p WHERE p.f <= ?", ahora - 30 * 86400),
    // «El primer peso»: días entre crear la sala y cobrar la primera entrada.
    uno<{ n: number; prom: number | null }>("SELECT COUNT(*) n, AVG(dias) prom FROM (SELECT (MIN(p.purchased_at) - r.created_at) / 86400.0 dias FROM passes p JOIN sessions s ON s.id = p.session_id JOIN rooms r ON r.id = s.room_id WHERE p.amount_cents > 0 GROUP BY r.id)"),
    // Creadores que antes de su primera sesión ya habían entrado a la sala de alguien más.
    uno<{ n: number }>("SELECT COUNT(*) n FROM (SELECT r.owner_id o, MIN(s.started_at) f FROM rooms r JOIN sessions s ON s.room_id = r.id GROUP BY r.owner_id) c WHERE EXISTS (SELECT 1 FROM passes p WHERE p.user_id = c.o AND p.purchased_at < c.f)"),
    todos<{ f: string; n: number; mes: number; cobran: number }>(`SELECT COALESCE(NULLIF(TRIM(signup_utm_source), ''), 'directo') f, COUNT(*) n, SUM(CASE WHEN u.created_at >= ?1 THEN 1 ELSE 0 END) mes, SUM(CASE WHEN EXISTS (SELECT 1 FROM ledger l WHERE l.user_id = u.id AND l.amount_cents > 0 AND l.type IN ${GAN}) THEN 1 ELSE 0 END) cobran FROM users u GROUP BY f ORDER BY n DESC LIMIT 8`, inicioMes),
    todos<{ slug: string; title: string; g: number; n: number; ses: number }>("SELECT r.slug, r.title, SUM(p.amount_cents) g, COUNT(*) n, COUNT(DISTINCT p.session_id) ses FROM passes p JOIN sessions s ON s.id = p.session_id JOIN rooms r ON r.id = s.room_id WHERE p.purchased_at >= ? AND p.amount_cents > 0 GROUP BY r.id ORDER BY g DESC LIMIT 5", inicioMes),
  ]);

  const de = <T extends { m: string }>(filas: T[], m: string) => filas.find((x) => x.m === m);
  const meses: MesGtm[] = [5, 4, 3, 2, 1, 0].map((k) => {
    const m = clave(k), p = de(pases, m), mb = de(memb, m), l = de(libro, m), s = de(ses, m);
    return {
      mes: m, creadores: l?.creadores ?? 0, pagan: de(pagan, m)?.n ?? 0,
      puerta_cents: (p?.g ?? 0) + (mb?.g ?? 0), casa_cents: (p?.casa ?? 0) + (mb?.casa ?? 0), envios_cents: de(envios, m)?.g ?? 0,
      entradas: p?.n ?? 0, membresias: mb?.n ?? 0, sesiones: s?.n ?? 0, sesiones_pagadas: p?.ses ?? 0, salas_transmitieron: s?.salas ?? 0,
      salas_nuevas: de(salas, m)?.n ?? 0, registros: de(usuarios, m)?.n ?? 0, recargas_cents: l?.recargas ?? 0, retiros_cents: l?.retiros ?? 0,
    };
  });
  const v: IndicadoresGtm = {
    generado: ahora, mes: clave(0), dia: d.getUTCDate(), dias_mes: new Date(Date.UTC(Y, Mo + 1, 0)).getUTCDate(), meses,
    embudo: {
      registros: emb?.registros ?? 0, salas: emb?.salas ?? 0, transmitieron: emb?.transmitieron ?? 0, cobraron: emb?.cobraron ?? 0,
      base7: siete?.base ?? 0, si7: siete?.si ?? 0, base30: treinta?.base ?? 0, si30: treinta?.si ?? 0,
      primer_peso_n: peso?.n ?? 0, primer_peso_dias: peso?.n ? Math.max(0, peso.prom ?? 0) : null, espectador_a_creador: e2c?.n ?? 0,
    },
    fuentes: fuentes.map((x) => ({ fuente: x.f, total: x.n, mes: x.mes, cobran: x.cobran })),
    top: top.map((x) => ({ slug: x.slug, titulo: x.title, puerta_cents: x.g, entradas: x.n, sesiones: x.ses })),
  };
  cache = { at: ahoraMs, v };
  return v;
}
