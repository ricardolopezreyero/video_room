// RLR · Qué correos recibe cada persona. Todo empieza prendido; cada quien
// apaga lo que no quiera desde su monedero (→ «Correos»). Los recibos de
// dinero y lo de la cuenta no se apagan: son el sello entre las dos partes.
import type { Env } from "../env";

export interface CategoriaCorreo {
  clave: string;
  nombre: string;
  que: string;
  /** Los fijos no tienen interruptor. */
  fijo?: boolean;
  /** Para creadores (quien transmite) o para quien ve. */
  para: "creador" | "publico" | "todos";
}

export const CATEGORIAS: CategoriaCorreo[] = [
  { clave: "recibos", nombre: "Recibos de dinero", que: "Cada entrada, envío, membresía, recarga y retiro, con folio y hora exacta. A las dos partes, siempre.", fijo: true, para: "todos" },
  { clave: "cuenta", nombre: "Tu cuenta", que: "Bienvenida, cuenta bancaria conectada y avisos de seguridad.", fijo: true, para: "todos" },
  { clave: "corte_semanal", nombre: "Corte semanal", que: "Los viernes a las 3:33 pm: todo lo que produjiste en los últimos 7 días, comparado con la semana anterior. Solo si hubo movimiento.", para: "creador" },
  { clave: "resumen_transmision", nombre: "Resumen al terminar cada transmisión", que: "Cuánto ganaste, cuánta gente hubo y qué reliquias se abrieron.", para: "creador" },
  { clave: "nuevo_seguidor", nombre: "Alguien activó «Avísame»", que: "Cuando una persona nueva pide que le avisemos de tu sala.", para: "creador" },
  { clave: "confirmacion_avisos", nombre: "Confirmación de avisos a tu gente", que: "Cuando les avisamos que ya casi empiezas o que ya estás en vivo: a cuántas personas les llegó.", para: "creador" },
  { clave: "salas_que_sigo", nombre: "Salas que sigues", que: "Cuando una sala que sigues va a empezar o ya está en vivo. También puedes dejar una sola sala desde el propio correo.", para: "publico" },
];

export const CLAVES = new Set(CATEGORIAS.filter((c) => !c.fijo).map((c) => c.clave));

/** Lee el JSON de la columna `correos` (solo guarda lo apagado). */
export function apagados(correos: string | null | undefined): Set<string> {
  if (!correos) return new Set();
  try {
    const j = JSON.parse(correos) as Record<string, unknown>;
    return new Set(Object.keys(j).filter((k) => j[k] === false));
  } catch {
    return new Set();
  }
}

/** ¿Esta persona quiere este correo? Con la fila ya leída (columna `correos`). */
export function quiereDeFila(correos: string | null | undefined, clave: string): boolean {
  if (!CLAVES.has(clave)) return true; // fijo o desconocido: se manda
  return !apagados(correos).has(clave);
}

/** ¿Esta persona quiere este correo? Con un viaje a la base. */
export async function quiere(env: Env, userId: string, clave: string): Promise<boolean> {
  if (!CLAVES.has(clave)) return true;
  const u = await env.DB.prepare("SELECT correos FROM users WHERE id = ?").bind(userId).first<{ correos: string | null }>();
  return quiereDeFila(u?.correos, clave);
}

export async function guardarPreferencia(env: Env, userId: string, clave: string, prendido: boolean): Promise<Set<string>> {
  if (!CLAVES.has(clave)) throw new Error("clave_desconocida");
  const u = await env.DB.prepare("SELECT correos FROM users WHERE id = ?").bind(userId).first<{ correos: string | null }>();
  const off = apagados(u?.correos);
  if (prendido) off.delete(clave); else off.add(clave);
  const json = off.size ? JSON.stringify(Object.fromEntries([...off].map((k) => [k, false]))) : null;
  await env.DB.prepare("UPDATE users SET correos = ? WHERE id = ?").bind(json, userId).run();
  return off;
}

export function estadoPara(correos: string | null | undefined): { clave: string; nombre: string; que: string; fijo: boolean; para: string; prendido: boolean }[] {
  const off = apagados(correos);
  return CATEGORIAS.map((c) => ({ clave: c.clave, nombre: c.nombre, que: c.que, fijo: !!c.fijo, para: c.para, prendido: c.fijo ? true : !off.has(c.clave) }));
}
