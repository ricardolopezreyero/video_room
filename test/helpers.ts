import { env } from "cloudflare:test";
import { signSession, SESSION_COOKIE } from "../src/lib/session";
import { newId } from "../src/lib/db";

export async function cookieFor(uid: string): Promise<string> {
  const token = await signSession((env as unknown as { SESSION_SECRET: string }).SESSION_SECRET, {
    uid,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${SESSION_COOKIE}=${token}`;
}

export async function createUser(opts: { id?: string; balanceCents?: number; creatorBalanceCents?: number } = {}): Promise<string> {
  const id = opts.id ?? newId("usr");
  await env.DB.prepare(
    "INSERT INTO users (id, google_id, email, name, balance_cents, creator_balance_cents) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, `g_${id}`, `${id}@test.local`, id, opts.balanceCents ?? 0, opts.creatorBalanceCents ?? 0).run();
  return id;
}

export async function connectUser(userId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET stripe_connect_account_id = ?, stripe_connect_payouts_enabled = 1 WHERE id = ?"
  ).bind(`acct_fake_${userId}`, userId).run();
}

export async function createRoom(ownerId: string, slug?: string): Promise<{ id: string; slug: string }> {
  const id = newId("room");
  const roomSlug = slug ?? id;
  await env.DB.prepare("INSERT INTO rooms (id, owner_id, slug, title) VALUES (?, ?, ?, ?)")
    .bind(id, ownerId, roomSlug, "Sala de prueba")
    .run();
  return { id, slug: roomSlug };
}

export async function createLiveSession(roomId: string): Promise<string> {
  const id = newId("sess");
  await env.DB.prepare("INSERT INTO sessions (id, room_id, status) VALUES (?, ?, 'live')").bind(id, roomId).run();
  return id;
}
