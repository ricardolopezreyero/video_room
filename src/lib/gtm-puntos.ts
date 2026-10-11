// RLR · Go-to-market de Video Room: los puntos de control económicos.
//
// Una tarea es algo que se hace. Un punto de control es un número al que hay
// que llegar: cuántos usuarios al mes y cuánto ingreso al mes. Van mezclados
// en el checklist, justo después de las tareas que los producen, para que
// nadie pierda de vista que todo el plan sirve a esas dos cosas.
//
// No se palomean a mano. Se cumplen solos cuando los números reales llegan, y
// queda guardada la fecha (en la misma tabla del checklist, con su id).
//
//   id       NO cambiarlo: es la llave de la fecha en que se alcanzó.
//   despues  id de la tarea tras la que aparece en el checklist.
//   metas    por mes, en pesos y en personas:
//              creadores  creadores que cobraron en el mes
//              pagan      personas que pagaron una entrada o membresía en el mes
//              puerta     entradas + membresías del mes
//              casa       lo que le queda a la casa de esa puerta
//              casa3      lo mínimo que dejó la casa en cada uno de los tres últimos meses cerrados
//   empujan  las tareas que más lo mueven.
//
// La cuenta detrás de «pagan»: cada persona gasta en promedio $110 al mes en
// la puerta (dos entradas de $55). Es un supuesto; se corrige con el dato real.
import type { Env } from "../env";
import { TAREAS } from "./gtm-tareas";

export interface Metas { creadores?: number; pagan?: number; puerta?: number; casa?: number; casa3?: number }
export interface Punto { id: string; fase: number; despues: string; cuando: string; titulo: string; detalle: string; metas: Metas; empujan: string[]; si_no: string }

export const PUNTOS: Punto[] = [
  // ── Paso 1 · Cimientos ────────────────────────────────────────────────
  { id: "pc01", fase: 1, despues: "111", cuando: "Semana 1", titulo: "El dinero da la vuelta completa",
    detalle: "Una sala real cobra entradas reales con la cuenta de cobros propia, y la conciliación cuadra. Antes de buscar creadores, la caja tiene que funcionar de punta a punta.",
    metas: { creadores: 1, pagan: 5, puerta: 300, casa: 60 }, empujan: ["105", "106", "111"],
    si_no: "Si falla una recarga, una entrada o un retiro, se arregla antes de invitar a nadie." },

  // ── Paso 2 · Los primeros 10, a mano ──────────────────────────────────
  { id: "pc02", fase: 2, despues: "201", cuando: "Semana 1", titulo: "El fundador cobró primero",
    detalle: "Tres sesiones cobradas por quien fundó, con unas veinte personas pagando. No se le pide a nadie lo que no hemos hecho.",
    metas: { creadores: 1, pagan: 20, puerta: 1500, casa: 300 }, empujan: ["201", "119", "140"],
    si_no: "Si no se llenan tres sesiones propias, el mensaje o el precio están mal. Se corrige antes de invitar a los diez." },
  { id: "pc03", fase: 2, despues: "209", cuando: "Semana 2", titulo: "Diez creadores con su primer peso",
    detalle: "Diez creadores cobran su primera sesión: diez personas a $60 cada una. Es la prueba de que le funciona a alguien que no somos nosotros.",
    metas: { creadores: 10, pagan: 100, puerta: 6000, casa: 1200 }, empujan: ["202", "207", "209", "214"],
    si_no: "Si cobran menos de siete, el problema es el montaje de la primera sesión, no el producto. Volver a la tarea 209." },
  { id: "pc04", fase: 2, despues: "231", cuando: "Semana 3", titulo: "Seis de diez repiten",
    detalle: "Los diez siguen activos y al menos seis ya dieron su segunda sesión. La puerta sube porque repiten, no porque llegue gente nueva.",
    metas: { creadores: 10, pagan: 140, puerta: 15000, casa: 3000 }, empujan: ["213", "226", "229", "232"],
    si_no: "Sin repetición no hay negocio. Si repiten menos de seis, no se contrata a nadie: primero se averigua por qué." },

  // ── Paso 3 · Los primeros 100 ─────────────────────────────────────────
  { id: "pc05", fase: 3, despues: "318", cuando: "Semana 5", titulo: "25 creadores cobrando",
    detalle: "La persona intensa ya trae creadores que no conocíamos. Cada uno deja en promedio $3,000 de puerta al mes.",
    metas: { creadores: 25, pagan: 700, puerta: 75000, casa: 15000 }, empujan: ["309", "311", "313", "322"],
    si_no: "Si los mensajes no convierten, se cambia el mensaje y el tipo de creador antes de mandar más." },
  { id: "pc06", fase: 3, despues: "358", cuando: "Semana 7", titulo: "50 creadores cobrando",
    detalle: "El contenido diario ya trae salas solas, además de los mensajes. La mitad del paso, a la mitad del tiempo.",
    metas: { creadores: 50, pagan: 1400, puerta: 150000, casa: 30000 }, empujan: ["323", "325", "315", "320"],
    si_no: "Si la puerta por creador baja de $3,000, hay demasiados creadores chicos: trabajar precio y repetición con la tarea 320." },
  { id: "pc07", fase: 3, despues: "360", cuando: "Semana 10", titulo: "100 creadores y $300,000 de puerta",
    detalle: "Cien creadores cobrando cada mes. La casa recibe $60,000: quitando la tarjeta, casi lo que cuesta operar.",
    metas: { creadores: 100, pagan: 2700, puerta: 300000, casa: 60000 }, empujan: ["350", "348", "356", "358"],
    si_no: "Una de cada cinco salas nuevas debe cobrar en sus primeros 14 días. Si no, no se abren las palancas del paso 4." },

  // ── Paso 4 · Los primeros 1,000 ───────────────────────────────────────
  { id: "pc08", fase: 4, despues: "420", cuando: "Mes 3", titulo: "La casa se paga sola",
    detalle: "Con $340,000 de puerta la casa recibe $68,000. Quitando cerca de 6 % de tarjeta quedan unos $47,000: lo que cuesta operar cada mes. Desde aquí, crecer ya no sale de la bolsa.",
    metas: { creadores: 115, pagan: 3100, puerta: 340000, casa: 68000 }, empujan: ["351", "107", "419", "420"],
    si_no: "Si la puerta llega y el dinero no alcanza, el problema es la comisión de tarjeta: empujar recargas grandes y transferencia." },
  { id: "pc09", fase: 4, despues: "413", cuando: "Mes 4", titulo: "250 creadores cobrando",
    detalle: "Las agencias y los embajadores ya traen creadores por grupos, no de uno en uno.",
    metas: { creadores: 250, pagan: 6800, puerta: 750000, casa: 150000 }, empujan: ["403", "405", "406", "414"],
    si_no: "Si las agencias no activan a su gente, se revisa la oferta y se capacita a sus managers antes de firmar más." },
  { id: "pc10", fase: 4, despues: "427", cuando: "Mes 5", titulo: "500 creadores y $1,500,000 de puerta",
    detalle: "Los eventos faro y las cabezas de cartel ya pesan en la puerta. La mitad de los mil.",
    metas: { creadores: 500, pagan: 13600, puerta: 1500000, casa: 300000 }, empujan: ["415", "416", "419", "420"],
    si_no: "Si hay creadores y la puerta no sube, falta precio y membresía: tareas 419 y 420." },
  { id: "pc11", fase: 4, despues: "448", cuando: "Mes 6", titulo: "1,000 creadores y $3,000,000 de puerta",
    detalle: "Mil creadores cobrando cada mes y $600,000 para la casa. Uno de cada tres llega sin que lo busquemos.",
    metas: { creadores: 1000, pagan: 27000, puerta: 3000000, casa: 600000 }, empujan: ["422", "432", "442", "418"],
    si_no: "Si casi todos llegan porque los buscamos, el circuito de espectador a creador no prendió: se arregla antes de salir del país." },

  // ── Paso 5 · El millón ────────────────────────────────────────────────
  { id: "pc12", fase: 5, despues: "523", cuando: "Mes 8", titulo: "$4,000,000 de puerta",
    detalle: "Las membresías ya ponen cerca de la tercera parte de la puerta y entran los primeros creadores de otros países.",
    metas: { creadores: 1150, pagan: 36000, puerta: 4000000, casa: 800000 }, empujan: ["501", "506", "507", "508"],
    si_no: "Si la puerta se estanca con mil creadores, toca crecer por creador: cabezas de cartel y membresías." },
  { id: "pc13", fase: 5, despues: "518", cuando: "Mes 10", titulo: "El millón",
    detalle: "$5,000,000 de puerta en un mes dejan $1,000,000 a la casa. 1,300 creadores cobrando y 45,000 personas pagando.",
    metas: { creadores: 1300, pagan: 45000, puerta: 5000000, casa: 1000000 }, empujan: ["507", "519", "518", "528"],
    si_no: "Vigilar la mezcla: si crecen los envíos y no la puerta, la casa no gana. Tarea 528." },
  { id: "pc14", fase: 5, despues: "530", cuando: "Mes 12", titulo: "El millón, tres meses seguidos",
    detalle: "Un mes bueno puede ser suerte. Tres meses seguidos arriba de $1,000,000 para la casa ya es una empresa.",
    metas: { casa3: 1000000 }, empujan: ["518", "519", "525", "530"],
    si_no: "Si un mes cae, se revisa qué cabeza de cartel se fue y qué generación dejó de repetir." },
];

export const esPuntoGtm = (id: string) => PUNTOS.some((p) => p.id === id);

/** Los números reales que mide cada meta (en pesos y personas). */
export interface RealPuntos { creadores_mes: number; pagan_mes: number; puerta_mes_cents: number; casa_mes_cents: number; casa_3m_min_cents: number }
export const valorReal = (k: keyof Metas, r: RealPuntos): number =>
  k === "creadores" ? r.creadores_mes : k === "pagan" ? r.pagan_mes : k === "puerta" ? r.puerta_mes_cents / 100 : k === "casa" ? r.casa_mes_cents / 100 : r.casa_3m_min_cents / 100;

/** Un punto se cumple cuando TODAS sus metas se cumplen en el mismo mes. */
export const puntoAlcanzado = (p: Punto, r: RealPuntos): boolean =>
  (Object.keys(p.metas) as (keyof Metas)[]).every((k) => valorReal(k, r) >= (p.metas[k] ?? Infinity));

type Hechas = Record<string, { por: string; nombre: string; at: number }>;
/** Guarda la fecha de los puntos que los números reales acaban de alcanzar. Devuelve cuáles. */
export async function registrarPuntos(env: Env, real: RealPuntos, hechas?: Hechas): Promise<string[]> {
  const ya = hechas ?? Object.fromEntries((await env.DB.prepare("SELECT id FROM gtm_tareas WHERE id LIKE 'pc%'").all<{ id: string }>()).results.map((x) => [x.id, true]));
  const nuevos = PUNTOS.filter((p) => !ya[p.id] && puntoAlcanzado(p, real));
  if (!nuevos.length) return [];
  await env.DB.batch(nuevos.flatMap((p) => [
    env.DB.prepare("INSERT OR IGNORE INTO gtm_tareas (id, hecha_por, hecha_nombre) VALUES (?, 'sistema', 'Números reales')").bind(p.id),
    env.DB.prepare("INSERT INTO gtm_bitacora (tarea, hecha, por, nombre) VALUES (?, 1, 'sistema', 'Números reales')").bind(p.id),
  ]));
  if (hechas) { const at = Math.floor(Date.now() / 1000); for (const p of nuevos) hechas[p.id] = { por: "sistema", nombre: "Números reales", at }; }
  return nuevos.map((p) => p.id);
}

/** Para las pruebas y para no romper el checklist: todo punto cuelga de una tarea que existe. */
export const tareaDe = (id: string) => TAREAS.find((t) => t[0] === id);
