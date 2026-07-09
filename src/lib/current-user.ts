import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession, SESSION_COOKIE } from "./session";
import type { User } from "./db";
import type { Env } from "../env";

export async function currentUser(c: Context<{ Bindings: Env }>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const data = await verifySession(c.env.SESSION_SECRET, token);
  if (!data) return null;
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(data.uid).first<User>();
  return user ?? null;
}
