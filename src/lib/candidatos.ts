// RLR · Candidatos: las fichas de personas que el equipo salió a buscar para
// un puesto. Este archivo no lleva a nadie adentro: cada ficha es un JSON en
// la tabla `candidatos` y solo se le manda a quien tiene acceso al plan. El
// repositorio es público; los nombres y lo que pensamos de cada quien, no.
// La pantalla es public/candidatos.js (un módulo que se puede llevar a otra
// app: pide la lista, guarda estado y notas, y deja agregar a alguien).
import type { Env } from "../env";
import { newId } from "./db";

export const ESTADOS = ["por_contactar", "contactado", "en_platica", "prueba", "descartado"] as const;
export type EstadoCandidato = (typeof ESTADOS)[number];

export interface FichaCandidato {
  id: string;
  grupo: "top" | "banca";
  orden: number;
  estado: EstadoCandidato;
  notas: string;
  updated_at: number | null;
  updated_por: string | null;
  [campo: string]: unknown;
}

interface Fila { id: string; grupo: string; orden: number; datos: string; estado: string; notas: string; updated_at: number | null; updated_por: string | null }

const txt = (v: unknown, max: number) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
const vacanteLimpia = (v: unknown) => (/^[a-z0-9-]{2,40}$/.test(String(v || "")) ? String(v) : "ceo");
/** Solo ligas http(s): lo que se guarda aquí termina en un href. */
export const ligaLimpia = (v: unknown) => { const s = txt(v, 300); return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : ""; };
const leer = (s: string): Record<string, unknown> => { try { const j = JSON.parse(s); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; } catch { return {}; } };

export async function listarCandidatos(env: Env, vacante: unknown = "ceo"): Promise<{ vacante: string; meta: Record<string, unknown>; fichas: FichaCandidato[] }> {
  const v = vacanteLimpia(vacante);
  const r = await env.DB.prepare(
    "SELECT id, grupo, orden, datos, estado, notas, updated_at, updated_por FROM candidatos WHERE vacante = ? ORDER BY (grupo = 'top') DESC, orden, created_at"
  ).bind(v).all<Fila>();
  let meta: Record<string, unknown> = {};
  const fichas: FichaCandidato[] = [];
  for (const f of r.results) {
    if (f.grupo === "meta") { meta = leer(f.datos); continue; }
    fichas.push({
      ...leer(f.datos),
      id: f.id, grupo: f.grupo === "top" ? "top" : "banca", orden: f.orden,
      estado: (ESTADOS as readonly string[]).includes(f.estado) ? (f.estado as EstadoCandidato) : "por_contactar",
      notas: f.notas, updated_at: f.updated_at, updated_por: f.updated_por,
    });
  }
  return { vacante: v, meta, fichas };
}

/** Cambiar el estado o las notas de una ficha: queda quién y cuándo. */
export async function moverCandidato(env: Env, id: string, cuerpo: Record<string, unknown>, por: string): Promise<{ error: string } | { ok: true; id: string; estado: string; notas: string; updated_at: number; updated_por: string }> {
  const fila = await env.DB.prepare("SELECT estado, notas, grupo FROM candidatos WHERE id = ?").bind(id).first<{ estado: string; notas: string; grupo: string }>();
  if (!fila || fila.grupo === "meta") return { error: "no_existe" };
  let estado = fila.estado, notas = fila.notas;
  if (cuerpo.estado !== undefined) {
    if (!(ESTADOS as readonly string[]).includes(String(cuerpo.estado))) return { error: "estado_invalido" };
    estado = String(cuerpo.estado);
  }
  if (cuerpo.notas !== undefined) notas = txt(cuerpo.notas, 4000);
  const at = Math.floor(Date.now() / 1000);
  await env.DB.prepare("UPDATE candidatos SET estado = ?, notas = ?, updated_at = ?, updated_por = ? WHERE id = ?").bind(estado, notas, at, por, id).run();
  return { ok: true, id, estado, notas, updated_at: at, updated_por: por };
}

/** Alguien del equipo agrega a una persona que encontró: entra a la banca. */
export async function agregarCandidato(env: Env, cuerpo: Record<string, unknown>, por: string): Promise<{ error: string } | { ok: true; ficha: FichaCandidato }> {
  const vacante = vacanteLimpia(cuerpo.vacante);
  const nombre = txt(cuerpo.nombre, 90), titular = txt(cuerpo.titular, 200), porque = txt(cuerpo.porque, 1200), ciudad = txt(cuerpo.ciudad, 80);
  const escrita = txt(cuerpo.liga, 300), liga = ligaLimpia(escrita);
  if (nombre.length < 3) return { error: "falta_nombre" };
  if (escrita && !liga) return { error: "liga_invalida" };
  const cuantos = await env.DB.prepare("SELECT COUNT(*) n FROM candidatos WHERE vacante = ?").bind(vacante).first<{ n: number }>();
  if ((cuantos?.n ?? 0) >= 300) return { error: "demasiados" };
  const id = newId("cand");
  const datos = { nombre, titular, ciudad, liga, resumen: porque, agregado_por: por };
  await env.DB.prepare("INSERT INTO candidatos (id, vacante, grupo, orden, datos, updated_at, updated_por) VALUES (?, ?, 'banca', 900, ?, unixepoch(), ?)").bind(id, vacante, JSON.stringify(datos), por).run();
  return { ok: true, ficha: { ...datos, id, grupo: "banca", orden: 900, estado: "por_contactar", notas: "", updated_at: Math.floor(Date.now() / 1000), updated_por: por } };
}
