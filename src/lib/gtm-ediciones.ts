// RLR · Go-to-market: editar, archivar y mover tareas sin tocar el plan.
//
// El plan vive en el código (gtm-tareas.ts) y no cambia. Lo que quien dirige
// le hace a una tarea se guarda aparte, una fila por tarea tocada, y se pone
// encima al pintar: su texto y sus etiquetas, si está archivada y en qué
// bloque y lugar quedó. Quitar esa fila regresa la tarea a como venía.
//
// Todo deja rastro en la bitácora (quién, qué y a qué hora), igual que las
// palomitas. Y es administrativo: solo correos de la casa.
import type { Env } from "../env";
import { TAREAS, BLOQUES } from "./gtm-tareas";

export const AREAS_GTM = ["VEN", "CON", "MKT", "ALI", "PRO", "DAT", "ADM"];
export const QUIEN_GTM = ["P", "IA", "A"];
export const RITMOS_GTM = ["u", "d", "s", "m"];
export const ACCIONES_GTM = ["hecha", "deshecha", "editada", "original", "archivada", "restaurada", "movida", "lugar", "punto"] as const;
export type AccionGtm = (typeof ACCIONES_GTM)[number];

export interface Edicion {
  titulo?: string; detalle?: string; area?: string; quien?: string; esfuerzo?: number; ritmo?: string;
  editada_por?: string; editada_at?: number;
  bloque?: string; pos?: number; movida_por?: string; movida_at?: number;
  archivada?: boolean; archivada_por?: string; archivada_at?: number; motivo?: string;
}
type Fila = { id: string; titulo: string | null; detalle: string | null; area: string | null; quien: string | null; esfuerzo: number | null; ritmo: string | null; editada_por: string | null; editada_at: number | null; bloque: string | null; pos: number | null; movida_por: string | null; movida_at: number | null; archivada: number; archivada_por: string | null; archivada_at: number | null; motivo: string | null };

const TITULOS = new Map(BLOQUES);
/** A qué bloque pertenece cada tarea tal como viene en el plan: la llave del bloque es el id de su primera tarea. */
export const BLOQUE_DE: Record<string, string> = {};
/** Los bloques en su orden, con su paso. */
export const BLOQUES_GTM: { llave: string; titulo: string; fase: number }[] = [];
{
  let llave = "", fase = 0;
  for (const t of TAREAS) {
    if (TITULOS.has(t[0]) || t[1] !== fase) { llave = t[0]; fase = t[1]; BLOQUES_GTM.push({ llave, titulo: TITULOS.get(t[0]) || "", fase }); }
    BLOQUE_DE[t[0]] = llave;
  }
}
const LUGAR = new Map(TAREAS.map((t, i) => [t[0], i]));

export async function edicionesGtm(env: Env): Promise<Record<string, Edicion>> {
  const r = await env.DB.prepare("SELECT * FROM gtm_ediciones").all<Fila>().catch(() => ({ results: [] as Fila[] }));
  const out: Record<string, Edicion> = {};
  for (const f of r.results) {
    const e: Edicion = {};
    if (f.titulo != null) e.titulo = f.titulo;
    if (f.detalle != null) e.detalle = f.detalle;
    if (f.area != null) e.area = f.area;
    if (f.quien != null) e.quien = f.quien;
    if (f.esfuerzo != null) e.esfuerzo = f.esfuerzo;
    if (f.ritmo != null) e.ritmo = f.ritmo;
    if (f.editada_at != null) { e.editada_por = f.editada_por || ""; e.editada_at = f.editada_at; }
    if (f.bloque != null) { e.bloque = f.bloque; e.pos = f.pos ?? 0; e.movida_por = f.movida_por || ""; e.movida_at = f.movida_at || 0; }
    if (f.archivada) { e.archivada = true; e.archivada_por = f.archivada_por || ""; e.archivada_at = f.archivada_at || 0; if (f.motivo) e.motivo = f.motivo; }
    if (Object.keys(e).length) out[f.id] = e;
  }
  return out;
}

/** Las tareas de un bloque, en el orden en que se ven: las movidas por su lugar, las demás como venían. */
export function tareasDelBloque(llave: string, ed: Record<string, Edicion>): string[] {
  return TAREAS.map((t) => t[0])
    .filter((id) => (ed[id]?.bloque ?? BLOQUE_DE[id]) === llave)
    .sort((a, b) => (ed[a]?.bloque != null ? ed[a]!.pos ?? 0 : 1e6 + LUGAR.get(a)!) - (ed[b]?.bloque != null ? ed[b]!.pos ?? 0 : 1e6 + LUGAR.get(b)!));
}

const limpio = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const ahora = () => Math.floor(Date.now() / 1000);
const apunta = (env: Env, id: string, accion: AccionGtm, por: string, nombre: string, at: number, nota = "") =>
  env.DB.prepare("INSERT INTO gtm_bitacora (tarea, hecha, por, nombre, at, accion, nota) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, accion === "hecha" ? 1 : 0, por, nombre, at, accion, nota.slice(0, 300));
/** La fila de bitácora de una palomita, con la misma forma que las demás acciones. */
export const apuntaPalomita = (env: Env, id: string, hecha: boolean, por: string, nombre: string, at: number) => apunta(env, id, hecha ? "hecha" : "deshecha", por, nombre, at);

type Quien = { por: string; nombre: string };
type Resultado = { error: string } | { ok: true; ediciones: Record<string, Edicion>; at: number };

/** Cambiar el texto o las etiquetas de una tarea. Lo que llega igual al plan no se guarda. */
export async function editarTarea(env: Env, id: string, c: Record<string, unknown>, q: Quien): Promise<Resultado> {
  const t = TAREAS.find((x) => x[0] === id);
  if (!t) return { error: "tarea_desconocida" };
  const titulo = limpio(c.titulo, 180), detalle = limpio(c.detalle, 1500), area = String(c.area || ""), quien = String(c.quien || ""), esfuerzo = Number(c.esfuerzo), ritmo = String(c.ritmo || "");
  if (titulo.length < 4) return { error: "titulo_corto" };
  if (detalle.length < 4) return { error: "detalle_corto" };
  if (!AREAS_GTM.includes(area) || !QUIEN_GTM.includes(quien) || ![1, 2, 3, 4].includes(esfuerzo) || !RITMOS_GTM.includes(ritmo)) return { error: "etiqueta_invalida" };
  const nuevo = { titulo: titulo === t[6] ? null : titulo, detalle: detalle === t[7] ? null : detalle, area: area === t[2] ? null : area, quien: quien === t[3] ? null : quien, esfuerzo: esfuerzo === t[4] ? null : esfuerzo, ritmo: ritmo === t[5] ? null : ritmo };
  const cambio = Object.entries(nuevo).filter(([, v]) => v != null).map(([k]) => k);
  const at = ahora();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO gtm_ediciones (id, titulo, detalle, area, quien, esfuerzo, ritmo, editada_por, editada_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET titulo = ?2, detalle = ?3, area = ?4, quien = ?5, esfuerzo = ?6, ritmo = ?7, editada_por = ?8, editada_at = ?9`)
      .bind(id, nuevo.titulo, nuevo.detalle, nuevo.area, nuevo.quien, nuevo.esfuerzo, nuevo.ritmo, cambio.length ? q.por : null, cambio.length ? at : null),
    apunta(env, id, cambio.length ? "editada" : "original", q.por, q.nombre, at, cambio.length ? "Cambió: " + cambio.join(", ") : ""),
  ]);
  return { ok: true, ediciones: await edicionesGtm(env), at };
}

/** Regresar el texto y las etiquetas a como vienen en el plan. */
export async function tareaOriginal(env: Env, id: string, q: Quien): Promise<Resultado> {
  if (!LUGAR.has(id)) return { error: "tarea_desconocida" };
  const at = ahora();
  await env.DB.batch([
    env.DB.prepare("UPDATE gtm_ediciones SET titulo = NULL, detalle = NULL, area = NULL, quien = NULL, esfuerzo = NULL, ritmo = NULL, editada_por = NULL, editada_at = NULL WHERE id = ?").bind(id),
    apunta(env, id, "original", q.por, q.nombre, at),
  ]);
  return { ok: true, ediciones: await edicionesGtm(env), at };
}

/** Archivar: se queda en su lugar, apagada, y deja de contar. Regresarla la prende otra vez. */
export async function archivarTarea(env: Env, id: string, archivada: boolean, motivo: unknown, q: Quien): Promise<Resultado> {
  if (!LUGAR.has(id)) return { error: "tarea_desconocida" };
  const at = ahora(), m = limpio(motivo, 200);
  await env.DB.batch([
    archivada
      ? env.DB.prepare(`INSERT INTO gtm_ediciones (id, archivada, archivada_por, archivada_at, motivo) VALUES (?1, 1, ?2, ?3, ?4)
          ON CONFLICT(id) DO UPDATE SET archivada = 1, archivada_por = ?2, archivada_at = ?3, motivo = ?4`).bind(id, q.por, at, m || null)
      : env.DB.prepare("UPDATE gtm_ediciones SET archivada = 0, archivada_por = NULL, archivada_at = NULL, motivo = NULL WHERE id = ?").bind(id),
    apunta(env, id, archivada ? "archivada" : "restaurada", q.por, q.nombre, at, archivada ? m : ""),
  ]);
  return { ok: true, ediciones: await edicionesGtm(env), at };
}

/** Mover una tarea: a qué bloque y antes de cuál (sin «antes_de» va al final). `original` la regresa a su lugar del plan. */
export async function moverTarea(env: Env, id: string, c: { bloque?: unknown; antes_de?: unknown; original?: unknown }, q: Quien): Promise<Resultado> {
  if (!LUGAR.has(id)) return { error: "tarea_desconocida" };
  const ed = await edicionesGtm(env), at = ahora();
  if (c.original) {
    // Regresa a su bloque del plan, antes de la primera tarea de ese bloque que venía después de ella.
    const casa = BLOQUE_DE[id]!, lista = tareasDelBloque(casa, ed).filter((x) => x !== id);
    const i = lista.findIndex((x) => BLOQUE_DE[x] === casa && LUGAR.get(x)! > LUGAR.get(id)!);
    lista.splice(i < 0 ? lista.length : i, 0, id);
    // Si el bloque quedó tal como viene en el plan, se borra el orden escrito: vuelve a ser el del plan.
    const comoElPlan = lista.every((x, n) => BLOQUE_DE[x] === casa && (n === 0 || LUGAR.get(lista[n - 1]!)! < LUGAR.get(x)!));
    const sql = comoElPlan
      ? lista.map((x) => env.DB.prepare("UPDATE gtm_ediciones SET bloque = NULL, pos = NULL, movida_por = NULL, movida_at = NULL WHERE id = ?").bind(x))
      : lista.map((x, n) => env.DB.prepare(`INSERT INTO gtm_ediciones (id, bloque, pos) VALUES (?1, ?2, ?3)
          ON CONFLICT(id) DO UPDATE SET bloque = ?2, pos = ?3, movida_por = CASE WHEN ?4 = 1 THEN NULL ELSE movida_por END, movida_at = CASE WHEN ?4 = 1 THEN NULL ELSE movida_at END`).bind(x, casa, n, x === id ? 1 : 0));
    await env.DB.batch([...sql, apunta(env, id, "lugar", q.por, q.nombre, at)]);
    return { ok: true, ediciones: await edicionesGtm(env), at };
  }
  const llave = String(c.bloque || ""), b = BLOQUES_GTM.find((x) => x.llave === llave);
  if (!b) return { error: "bloque_desconocido" };
  const antes = c.antes_de ? String(c.antes_de) : "";
  const lista = tareasDelBloque(llave, ed).filter((x) => x !== id);
  const i = antes ? lista.indexOf(antes) : -1;
  if (antes && i < 0) return { error: "antes_de_desconocida" };
  lista.splice(i < 0 ? lista.length : i, 0, id);
  // Todo el bloque queda con su lugar escrito: así el orden no depende de lo que se mueva después.
  const sql = lista.map((x, n) => env.DB.prepare(`INSERT INTO gtm_ediciones (id, bloque, pos, movida_por, movida_at) VALUES (?1, ?2, ?3, CASE WHEN ?6 = 1 THEN ?4 END, CASE WHEN ?6 = 1 THEN ?5 END)
    ON CONFLICT(id) DO UPDATE SET bloque = ?2, pos = ?3, movida_por = CASE WHEN ?6 = 1 THEN ?4 ELSE movida_por END, movida_at = CASE WHEN ?6 = 1 THEN ?5 ELSE movida_at END`).bind(x, llave, n, q.por, at, x === id ? 1 : 0));
  await env.DB.batch([...sql, apunta(env, id, "movida", q.por, q.nombre, at, `Paso ${b.fase} · ${b.titulo}`)]);
  return { ok: true, ediciones: await edicionesGtm(env), at };
}
