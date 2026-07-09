import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
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
  setCookie(c, SESSION_COOKIE, freshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return user;
}
