import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { verifySession, signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./session";
import type { User } from "./db";
import type { Env } from "../env";

export async function currentUser(c: Context<{ Bindings: Env }>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const data = await verifySession(c.env.SESSION_SECRET, token);
  if (!data) return null;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(data.uid).first<User>();
  if (!user) return null;

  // Sesión deslizante: cada visita válida renueva la cookie otros 400 días,
  // así que mientras la persona use la app de vez en cuando nunca la expulsamos.
  const freshToken = await signSession(c.env.SESSION_SECRET, {
    uid: data.uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });
  ponerSesion(c, freshToken);

  return user;
}

/** La sesión son dos cookies: `vr_session` (HttpOnly, la que vale) y `vr_ok`
 *  (visible para JS, solo dice "aquí hay sesión") para que el puente con el
 *  login de la casa sepa si hace falta pedirla. */
export function ponerSesion(c: Context<{ Bindings: Env }>, token: string): void {
  const base = { secure: true, sameSite: "Lax" as const, maxAge: SESSION_MAX_AGE_SECONDS, path: "/" };
  setCookie(c, SESSION_COOKIE, token, { ...base, httpOnly: true });
  setCookie(c, "vr_ok", "1", { ...base, httpOnly: false });
}
export function quitarSesion(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  deleteCookie(c, "vr_ok", { path: "/" });
}

/** Solo el uid de la cookie (firma verificada), sin tocar la base. Sirve para
 *  lanzar en paralelo la consulta del usuario y las que solo necesitan su id:
 *  un viaje a la base en vez de dos, en cada ruta que lo usa. */
export async function sessionUid(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const data = await verifySession(c.env.SESSION_SECRET, token);
  return data?.uid ?? null;
}
