import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { creditLedger, newId, type Room, type Session, type User } from "../lib/db";
import { slugify, isNumericSlug, nextAvailableSlug } from "../lib/slugs";
import { readUtmCookie } from "../lib/utm";
import { notifyRoomLive, notifyRoomStartingSoon } from "../lib/notify";
import type { Env } from "../env";

export const rooms = new Hono<{ Bindings: Env }>();

// Respaldo para cuentas creadas antes de que el login asignara sala automáticamente.
rooms.post("/api/rooms", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);

  const existing = await c.env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(user.id).first<Room>();
  if (existing) return c.json({ slug: existing.slug });

  const slug = await nextAvailableSlug(c.env.DB);
  await c.env.DB.prepare("INSERT INTO rooms (id, owner_id, slug, title) VALUES (?, ?, ?, ?)")
    .bind(newId("room"), user.id, slug, user.name)
    .run();
  return c.json({ slug });
});

rooms.get("/api/rooms/mine", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(user.id).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const ageDays = Math.floor((Date.now() / 1000 - room.slug_assigned_at) / 86400);
  const notifyCount = await c.env.DB.prepare("SELECT COUNT(*) as n FROM notify_me WHERE room_id = ?")
    .bind(room.id)
    .first<{ n: number }>();
  return c.json({
    slug: room.slug,
    is_numeric: isNumericSlug(room.slug),
    age_days: ageDays,
    notify_count: notifyCount?.n ?? 0,
  });
});

const MAX_STARTING_SOON_MINUTES = 24 * 60;

rooms.post("/api/rooms/:slug/notify-starting", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { minutes } = await c.req.json<{ minutes: number }>().catch(() => ({ minutes: NaN }));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_STARTING_SOON_MINUTES) {
    return c.json({ error: "minutos_invalidos" }, 400);
  }

  const count = await notifyRoomStartingSoon(c.env, room, minutes, user.name, user.avatar_url);
  return c.json({ ok: true, count });
});

rooms.post("/api/rooms/:slug/rename", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { new_slug: rawSlug } = await c.req.json<{ new_slug: string }>().catch(() => ({ new_slug: "" }));
  const newSlug = slugify(rawSlug ?? "");
  if (!newSlug) return c.json({ error: "slug_invalido" }, 400);
  if (newSlug === slug) return c.json({ error: "mismo_slug" }, 400);
  if (isNumericSlug(newSlug)) return c.json({ error: "slug_numerico_reservado" }, 400);

  const taken = await c.env.DB.prepare("SELECT id FROM rooms WHERE slug = ?").bind(newSlug).first();
  if (taken) return c.json({ error: "slug_ocupado" }, 400);

  const oldSlugWasNumeric = isNumericSlug(slug);
  const statements = [
    c.env.DB.prepare("UPDATE rooms SET slug = ?, slug_assigned_at = unixepoch() WHERE id = ?").bind(newSlug, room.id),
  ];
  if (oldSlugWasNumeric) {
    statements.push(c.env.DB.prepare("INSERT INTO released_slugs (slug) VALUES (?)").bind(slug));
  }
  await c.env.DB.batch(statements);

  return c.json({ ok: true, slug: newSlug });
});

rooms.post("/api/rooms/:slug/start", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const live = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  if (live) return c.json({ session_id: live.id });

  const sessionId = newId("sess");
  await c.env.DB.prepare("INSERT INTO sessions (id, room_id, status) VALUES (?, ?, 'live')").bind(sessionId, room.id).run();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/start", { method: "POST", body: JSON.stringify({ sessionId }) });

  // No bloquea la respuesta: el creador no debe esperar a que salgan los correos.
  c.executionCtx.waitUntil(notifyRoomLive(c.env, room, sessionId, user.name, user.avatar_url));

  return c.json({ session_id: sessionId });
});

rooms.post("/api/rooms/:slug/stop", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const live = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  if (!live) return c.json({ error: "no_live_session" }, 400);

  await c.env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = unixepoch() WHERE id = ?").bind(live.id).run();
  // Los comentarios son eventos fugaces: se borran al cerrar la sala, sin
  // excepciones, y en segundo plano para no retrasar la respuesta al creador.
  c.executionCtx.waitUntil(c.env.DB.prepare("DELETE FROM comments WHERE session_id = ?").bind(live.id).run());

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const summary = await stub.fetch("https://do/stop", { method: "POST" });
  return c.json(await summary.json());
});

rooms.get("/api/rooms/:slug/status", async (c) => {
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const live = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  return c.json({ room, live_session: live ?? null });
});

// Compra o renovación del pase de entrada ($20/hora, split 50/50)
rooms.post("/api/rooms/:slug/pass", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const { device_id } = await c.req.json<{ device_id: string }>().catch(() => ({ device_id: "web" }));

  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  if (!session) return c.json({ error: "sala_cerrada" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const validPass = await c.env.DB.prepare(
    "SELECT * FROM passes WHERE session_id = ? AND user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1"
  ).bind(session.id, user.id, now).first<{ id: string; expires_at: number }>();
  if (validPass) return c.json({ ok: true, expires_at: validPass.expires_at, charged: false });

  if (user.id === room.owner_id) {
    // el creador entra gratis a su propia sala
    const passId = newId("pass");
    const expiresAt = now + 3600;
    await c.env.DB.prepare(
      "INSERT INTO passes (id, session_id, user_id, expires_at, device_id) VALUES (?, ?, ?, ?, ?)"
    ).bind(passId, session.id, user.id, expiresAt, device_id ?? "web").run();
    return c.json({ ok: true, expires_at: expiresAt, charged: false });
  }

  if (user.balance_cents < 2000) return c.json({ error: "saldo_insuficiente" }, 402);

  const passId = newId("pass");
  const expiresAt = now + 3600;
  const utm = readUtmCookie(c);
  // Idem key atada a sesión+usuario+segundo: dos clics dobles en el mismo segundo
  // (el caso real de doble-tap) chocan en esta llave y solo uno se cobra.
  const debited = await creditLedger(c.env.DB, user.id, -2000, "entrada", passId, `entrada:${session.id}:${user.id}:${now}`, "balance_cents");
  if (!debited) {
    const racedPass = await c.env.DB.prepare(
      "SELECT id, expires_at FROM passes WHERE session_id = ? AND user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1"
    ).bind(session.id, user.id, now).first<{ id: string; expires_at: number }>();
    if (racedPass) return c.json({ ok: true, expires_at: racedPass.expires_at, charged: false });
    return c.json({ error: "no_procesado" }, 500);
  }
  await creditLedger(c.env.DB, room.owner_id, 1000, "ganancia_entrada", passId, `ganancia_entrada:${passId}`, "creator_balance_cents");
  await c.env.DB.prepare(
    `INSERT INTO passes (id, session_id, user_id, expires_at, device_id, utm_source, utm_medium, utm_campaign)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(passId, session.id, user.id, expiresAt, device_id ?? "web", utm.utm_source ?? null, utm.utm_medium ?? null, utm.utm_campaign ?? null).run();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/entrada", { method: "POST", body: JSON.stringify({ name: user.name }) });

  return c.json({ ok: true, expires_at: expiresAt, charged: true });
});

const TIP_SESSION_CAP_CENTS = 200000;

rooms.post("/api/rooms/:slug/tip", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const { amount_cents, message } = await c.req.json<{ amount_cents: number; message?: string }>();
  if (!Number.isInteger(amount_cents) || amount_cents < 1000) return c.json({ error: "monto_invalido" }, 400);

  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  if (!session) return c.json({ error: "sala_cerrada" }, 400);
  if (user.balance_cents < amount_cents) return c.json({ error: "saldo_insuficiente" }, 402);

  const alreadyTipped = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as total FROM tips WHERE session_id = ? AND from_user = ?"
  ).bind(session.id, user.id).first<{ total: number }>();
  if ((alreadyTipped?.total ?? 0) + amount_cents > TIP_SESSION_CAP_CENTS) {
    return c.json({ error: "limite_propinas_alcanzado" }, 400);
  }

  const tipId = newId("tip");
  const creatorCut = Math.round(amount_cents * 0.9);
  const debited = await creditLedger(c.env.DB, user.id, -amount_cents, "propina_enviada", tipId, `propina_env:${tipId}`, "balance_cents");
  if (!debited) return c.json({ error: "no_procesado" }, 500);
  await creditLedger(c.env.DB, room.owner_id, creatorCut, "propina_recibida", tipId, `propina_rec:${tipId}`, "creator_balance_cents");
  await c.env.DB.prepare(
    "INSERT INTO tips (id, session_id, from_user, to_user, amount_cents, message) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(tipId, session.id, user.id, room.owner_id, amount_cents, (message ?? "").slice(0, 60)).run();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/tip", {
    method: "POST",
    body: JSON.stringify({ from: user.name, amount_cents, message: (message ?? "").slice(0, 60) }),
  });

  return c.json({ ok: true, creator_cut_cents: creatorCut });
});

const MAX_COMMENT_LENGTH = 240;

rooms.post("/api/rooms/:slug/comment", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const { text } = await c.req.json<{ text: string }>().catch(() => ({ text: "" }));
  const body = (text ?? "").trim().slice(0, MAX_COMMENT_LENGTH);
  if (!body) return c.json({ error: "vacio" }, 400);

  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  if (!session) return c.json({ error: "sala_cerrada" }, 400);

  if (user.id !== room.owner_id) {
    const now = Math.floor(Date.now() / 1000);
    const validPass = await c.env.DB.prepare(
      "SELECT id FROM passes WHERE session_id = ? AND user_id = ? AND expires_at > ?"
    ).bind(session.id, user.id, now).first();
    if (!validPass) return c.json({ error: "sin_pase" }, 402);
  }

  await c.env.DB.prepare(
    "INSERT INTO comments (id, session_id, user_id, body) VALUES (?, ?, ?, ?)"
  ).bind(newId("cmt"), session.id, user.id, body).run();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/comment", {
    method: "POST",
    body: JSON.stringify({ name: user.name, body, is_owner: user.id === room.owner_id }),
  });

  return c.json({ ok: true });
});

rooms.post("/api/rooms/:slug/notify-me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare("INSERT OR IGNORE INTO notify_me (room_id, user_id) VALUES (?, ?)").bind(room.id, user.id).run();
  return c.json({ ok: true });
});
