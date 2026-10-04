// RLR
// API pública de Video Room. Somos un servicio, no una marca: cualquier
// plataforma debe poder leer el estado de una sala, enterarse de lo que pasa
// (webhooks) y poner un botón de "en vivo" en su sitio en cinco minutos.
// Documentación: /app/api
import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { apiUser, createApiKey, randomHex } from "../lib/api-auth";
import { computeCreatorStats } from "../lib/stats-core";
import { deliverToEndpoint, emitEvent, WEBHOOK_EVENTS, type WebhookEndpoint, type WebhookEvent } from "../lib/webhooks";
import { notifyRoomStartingSoon } from "../lib/notify";
import { newId, type Room, type Session, type User } from "../lib/db";
import type { Env } from "../env";

export const apiV1 = new Hono<{ Bindings: Env }>();

const PRICE_PER_HOUR_CENTS = 2000;
const MAX_STARTING_SOON_MINUTES = 24 * 60;

// CORS abierto: la API se consume desde sitios de terceros. Con "*" los
// navegadores nunca mandan cookies, así que la sesión no viaja a otros
// orígenes; lo que viaja es la llave Bearer, que es lo que queremos.
apiV1.use("/api/v1/*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", "*");
});

/** Llave Bearer o, si no viene, la sesión del navegador (para probar desde la propia app). */
async function authedUser(c: Parameters<typeof apiUser>[0]): Promise<User | null> {
  return (await apiUser(c)) ?? (c.req.header("authorization") ? null : await currentUser(c));
}

async function roomOf(env: Env, user: User): Promise<Room | null> {
  return env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(user.id).first<Room>();
}

async function liveSession(env: Env, roomId: string): Promise<Session | null> {
  return env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'").bind(roomId).first<Session>();
}

async function liveViewers(env: Env, roomId: string): Promise<number> {
  try {
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    const res = await stub.fetch("https://do/sfu-session");
    const j = await res.json<{ viewerCount?: number }>();
    return j.viewerCount ?? 0;
  } catch {
    return 0;
  }
}

function roomPayload(env: Env, room: Room, owner: { name: string; avatar_url: string | null }, live: Session | null, viewers: number) {
  return {
    slug: room.slug,
    title: room.title,
    url: `${env.APP_URL}/${room.slug}`,
    creator: { name: owner.name, avatar_url: owner.avatar_url },
    live: !!live,
    viewers: live ? viewers : 0,
    started_at: live ? live.started_at : null,
    price_per_hour_cents: PRICE_PER_HOUR_CENTS,
    currency: "MXN",
  };
}

// ---------------------------------------------------------------------------
// Público (sin llave): el estado de cualquier sala. Es lo que usa embed.js.
// ---------------------------------------------------------------------------
apiV1.get("/api/v1/public/rooms/:slug", async (c) => {
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare(
    "SELECT rooms.*, users.name as owner_name, users.avatar_url as owner_avatar FROM rooms JOIN users ON users.id = rooms.owner_id WHERE rooms.slug = ?"
  ).bind(slug).first<Room & { owner_name: string; owner_avatar: string | null }>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const live = await liveSession(c.env, room.id);
  const viewers = live ? await liveViewers(c.env, room.id) : 0;
  c.header("Cache-Control", "public, max-age=10");
  return c.json(roomPayload(c.env, room, { name: room.owner_name, avatar_url: room.owner_avatar }, live, viewers));
});

// ---------------------------------------------------------------------------
// Con llave (o sesión): la cuenta del creador
// ---------------------------------------------------------------------------
apiV1.get("/api/v1/me", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const room = await roomOf(c.env, user);
  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url,
    balance_cents: user.balance_cents,
    creator_balance_cents: user.creator_balance_cents,
    payouts_enabled: !!user.stripe_connect_payouts_enabled,
    room: room ? { slug: room.slug, url: `${c.env.APP_URL}/${room.slug}` } : null,
  });
});

apiV1.get("/api/v1/room", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const room = await roomOf(c.env, user);
  if (!room) return c.json({ error: "no_room" }, 404);
  const live = await liveSession(c.env, room.id);
  const viewers = live ? await liveViewers(c.env, room.id) : 0;
  const followers = await c.env.DB.prepare("SELECT COUNT(*) as n FROM notify_me WHERE room_id = ?").bind(room.id).first<{ n: number }>();
  return c.json({ ...roomPayload(c.env, room, user, live, viewers), followers: followers?.n ?? 0 });
});

apiV1.post("/api/v1/room/notify-starting", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const room = await roomOf(c.env, user);
  if (!room) return c.json({ error: "no_room" }, 404);
  const { minutes } = await c.req.json<{ minutes: number }>().catch(() => ({ minutes: NaN }));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_STARTING_SOON_MINUTES) {
    return c.json({ error: "minutes_invalid", hint: "Entero entre 1 y 1440" }, 400);
  }
  const count = await notifyRoomStartingSoon(c.env, room, minutes, user.name, user.avatar_url, user.email);
  return c.json({ ok: true, notified: count });
});

apiV1.get("/api/v1/stats", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const room = await roomOf(c.env, user);
  if (!room) return c.json({ error: "no_room" }, 404);
  return c.json(await computeCreatorStats(c.env, user, room, c.req.query("range") ?? "30d"));
});

apiV1.get("/api/v1/transactions", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  const before = Number(c.req.query("before") ?? 0) || Math.floor(Date.now() / 1000) + 1;
  const { results } = await c.env.DB.prepare(
    "SELECT id, type, amount_cents, ref_id, created_at FROM ledger WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?"
  ).bind(user.id, before, limit).all<{ id: string; type: string; amount_cents: number; ref_id: string | null; created_at: number }>();
  const next = results.length === limit ? results[results.length - 1].created_at : null;
  return c.json({ transactions: results, next_before: next });
});

apiV1.get("/api/v1/sessions", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const room = await roomOf(c.env, user);
  if (!room) return c.json({ error: "no_room" }, 404);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.started_at, s.ended_at, s.status,
            (SELECT COUNT(*) FROM passes p WHERE p.session_id = s.id AND p.user_id != ?) as entradas,
            (SELECT COUNT(DISTINCT p.user_id) FROM passes p WHERE p.session_id = s.id AND p.user_id != ?) as unique_viewers,
            (SELECT COALESCE(SUM(t.amount_cents), 0) FROM tips t WHERE t.session_id = s.id) as tips_cents
     FROM sessions s WHERE s.room_id = ? ORDER BY s.started_at DESC LIMIT ?`
  ).bind(user.id, user.id, room.id, limit).all<{ id: string; started_at: number; ended_at: number | null; status: string; entradas: number; unique_viewers: number; tips_cents: number }>();
  return c.json({
    sessions: results.map((s) => ({
      ...s,
      duration_seconds: (s.ended_at ?? Math.floor(Date.now() / 1000)) - s.started_at,
      // Lo que se quedó el creador: $10 por entrada + 90% de las propinas.
      earned_cents: s.entradas * 1000 + Math.round(s.tips_cents * 0.9),
    })),
  });
});

apiV1.get("/api/v1/followers", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const room = await roomOf(c.env, user);
  if (!room) return c.json({ error: "no_room" }, 404);
  const row = await c.env.DB.prepare("SELECT COUNT(*) as n FROM notify_me WHERE room_id = ?").bind(room.id).first<{ n: number }>();
  return c.json({ count: row?.n ?? 0 });
});

// ---------------------------------------------------------------------------
// Webhooks (gestión): con llave o con sesión
// ---------------------------------------------------------------------------
function publicEndpoint(e: WebhookEndpoint) {
  return {
    id: e.id,
    url: e.url,
    events: e.events === "*" ? ["*"] : e.events.split(","),
    active: !!e.active,
    created_at: e.created_at,
    last_delivered_at: e.last_delivered_at,
    last_status: e.last_status,
    last_error: e.last_error,
  };
}

apiV1.get("/api/v1/webhooks", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { results } = await c.env.DB.prepare("SELECT * FROM webhook_endpoints WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all<WebhookEndpoint>();
  return c.json({ webhooks: results.map(publicEndpoint), events: WEBHOOK_EVENTS });
});

apiV1.post("/api/v1/webhooks", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ url?: string; events?: string[] }>().catch((): { url?: string; events?: string[] } => ({}));
  const url = String(body.url ?? "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(url)) return c.json({ error: "url_invalid", hint: "Debe ser https://" }, 400);
  const count = await c.env.DB.prepare("SELECT COUNT(*) as n FROM webhook_endpoints WHERE user_id = ?").bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) return c.json({ error: "too_many", hint: "Máximo 10 webhooks por cuenta" }, 400);
  const wanted = Array.isArray(body.events) && body.events.length ? body.events.map(String) : ["*"];
  const bad = wanted.filter((e) => e !== "*" && !(WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (bad.length) return c.json({ error: "events_invalid", invalid: bad, allowed: WEBHOOK_EVENTS }, 400);
  const id = newId("whk");
  const secret = `whsec_${randomHex(24)}`;
  await c.env.DB.prepare(
    "INSERT INTO webhook_endpoints (id, user_id, url, secret, events) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, user.id, url, secret, wanted.includes("*") ? "*" : wanted.join(",")).run();
  const row = await c.env.DB.prepare("SELECT * FROM webhook_endpoints WHERE id = ?").bind(id).first<WebhookEndpoint>();
  // El secreto solo se enseña aquí, una vez — igual que una llave.
  return c.json({ ...publicEndpoint(row!), secret }, 201);
});

apiV1.delete("/api/v1/webhooks/:id", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const r = await c.env.DB.prepare("DELETE FROM webhook_endpoints WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  if (!r.meta.changes) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

apiV1.post("/api/v1/webhooks/:id/test", async (c) => {
  const user = await authedUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const e = await c.env.DB.prepare("SELECT * FROM webhook_endpoints WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first<WebhookEndpoint>();
  if (!e) return c.json({ error: "not_found" }, 404);
  const result = await deliverToEndpoint(c.env, e, "ping", { message: "Hola desde Video Room. Si lees esto, tu webhook funciona." });
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Llaves de API (solo con sesión: es el panel del creador)
// ---------------------------------------------------------------------------
apiV1.get("/api/integrations/keys", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC"
  ).bind(user.id).all();
  return c.json({ keys: results });
});

apiV1.post("/api/integrations/keys", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const count = await c.env.DB.prepare("SELECT COUNT(*) as n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL").bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) return c.json({ error: "too_many" }, 400);
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({ name: "" }));
  const created = await createApiKey(c.env.DB, user.id, String(name ?? "").trim());
  return c.json(created, 201);
});

apiV1.delete("/api/integrations/keys/:id", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const r = await c.env.DB.prepare("UPDATE api_keys SET revoked_at = unixepoch() WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(c.req.param("id"), user.id).run();
  if (!r.meta.changes) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// Para que el panel pueda disparar un evento real de prueba a todos sus webhooks.
apiV1.post("/api/integrations/webhooks/ping", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  await emitEvent(c.env, user.id, "ping" as WebhookEvent, { message: "Prueba desde el monedero de Video Room." });
  return c.json({ ok: true });
});
