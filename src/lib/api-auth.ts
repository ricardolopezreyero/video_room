// RLR
// Llaves de API: `Authorization: Bearer vr_live_…`. Solo guardamos el hash;
// la llave completa se enseña una vez al crearla y no se puede recuperar.
import type { Context } from "hono";
import { newId, type User } from "./db";
import type { Env } from "../env";

const KEY_PREFIX = "vr_live_";

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return hex(arr.buffer);
}

/** Crea una llave para el usuario y devuelve el valor completo (única vez). */
export async function createApiKey(db: D1Database, userId: string, name: string): Promise<{ id: string; key: string; prefix: string }> {
  const key = KEY_PREFIX + randomHex(24);
  const prefix = key.slice(0, KEY_PREFIX.length + 6);
  const id = newId("key");
  await db.prepare(
    "INSERT INTO api_keys (id, user_id, name, prefix, key_hash) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, userId, name.slice(0, 60) || "Mi integración", prefix, await sha256Hex(key)).run();
  return { id, key, prefix };
}

/** Usuario detrás de una llave Bearer válida y no revocada; null si no hay. */
export async function apiUser(c: Context<{ Bindings: Env }>): Promise<User | null> {
  const auth = c.req.header("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(vr_live_[a-f0-9]{48})$/i);
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const row = await c.env.DB.prepare(
    `SELECT u.*, k.id as key_id FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL`
  ).bind(hash).first<User & { key_id: string }>();
  if (!row) return null;
  // Último uso: útil para que el creador vea qué llaves siguen vivas. No
  // importa si falla; nunca debe tumbar la petición.
  try {
    await c.env.DB.prepare("UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?").bind(row.key_id).run();
  } catch {
    /* sin consecuencias */
  }
  const { key_id: _k, ...user } = row;
  return user as User;
}
