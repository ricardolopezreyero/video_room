// RLR
import { Hono } from "hono";
import { currentUser, sessionUid } from "../lib/current-user";
import { creditLedger, newId, isBlocked, isMuted, type Room, type Session, type User } from "../lib/db";
import { slugify, isNumericSlug, isReservedSlug, nextAvailableSlug } from "../lib/slugs";
import { readUtmCookie } from "../lib/utm";
import { notifyRoomLive, notifyRoomStartingSoon } from "../lib/notify";
import { sendEmail, newFollowerEmail } from "../lib/email";
import { enviarRecibos } from "../lib/recibos";
import { entradaGratis } from "../lib/cortesia";
import { emitEvent } from "../lib/webhooks";
import { evaluateRelics, viewerMarkFor } from "../lib/status";
import {
  entrySplit, membershipSplit, tipSplit, isPriceOption, isMembershipOption, isHighlightOption,
  HIGHLIGHT_SECONDS, FAREWELL_TIP_WINDOW_SECONDS, MEMBERSHIP_DAYS, PRICE_OPTIONS_CENTS, MEMBERSHIP_OPTIONS_CENTS, HIGHLIGHT_OPTIONS_CENTS,
} from "../lib/pricing";
import { endLiveSession } from "../lib/room-lifecycle";
import type { Env } from "../env";
import { afterResponse } from "../lib/segundo-plano";

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
  const uid = await sessionUid(c);
  if (!uid) return c.json({ error: "no_session" }, 401);
  // Usuario, sala y conteo de avisos en un solo viaje: el conteo va como
  // subconsulta de la misma fila.
  const [user, room] = await Promise.all([
    currentUser(c),
    c.env.DB.prepare(
      "SELECT rooms.*, (SELECT COUNT(*) FROM notify_me WHERE notify_me.room_id = rooms.id) as notify_count FROM rooms WHERE owner_id = ?"
    ).bind(uid).first<Room & { notify_count: number }>(),
  ]);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (!room) return c.json({ error: "not_found" }, 404);
  const ageDays = Math.floor((Date.now() / 1000 - room.slug_assigned_at) / 86400);
  return c.json({
    slug: room.slug,
    is_numeric: isNumericSlug(room.slug),
    age_days: ageDays,
    notify_count: room.notify_count ?? 0,
    price_cents: room.price_cents || 2000,
    membership_cents: room.membership_cents,
    tip_goal_cents: room.tip_goal_cents,
    price_options_cents: PRICE_OPTIONS_CENTS,
    membership_options_cents: MEMBERSHIP_OPTIONS_CENTS,
    split: entrySplit(room.price_cents || 2000),
    membership_split: room.membership_cents ? membershipSplit(room.membership_cents) : null,
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

  const count = await notifyRoomStartingSoon(c.env, room, minutes, user.name, user.avatar_url, user.email);
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
  if (isReservedSlug(newSlug)) return c.json({ error: "slug_reservado" }, 400);

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

  // Se espera a que termine (no waitUntil) para que el envío sea confiable —
  // un fallo aquí no debe tumbar el inicio de la transmisión, así que va en
  // su propio try/catch.
  try {
    await notifyRoomLive(c.env, room, sessionId, user.name, user.avatar_url, user.email);
  } catch (err) {
    console.error(err);
  }
  await emitEvent(c.env, user.id, "room.live", {
    session_id: sessionId,
    room: { slug: room.slug, url: `${c.env.APP_URL}/${room.slug}` },
  });

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

  const summary = await endLiveSession(c.env, room, live, (p) => c.executionCtx.waitUntil(p));
  return c.json(summary);
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

// Compra o renovación del pase de entrada (precio del creador; reparto en src/lib/pricing.ts)
rooms.post("/api/rooms/:slug/pass", async (c) => {
  // Es el paso entre "Entrar" y el video: cada viaje a la base aquí es espera
  // visible. Las lecturas salen en paralelo por rondas, y lo que no cambia la
  // respuesta (recibo, webhook) sale después de responder.
  const slug = c.req.param("slug");
  const [user, room, body] = await Promise.all([
    currentUser(c),
    c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>(),
    c.req.json<{ device_id?: string }>().catch(() => ({ device_id: "web" })),
  ]);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (!room) return c.json({ error: "not_found" }, 404);
  const device_id = body.device_id ?? "web";
  const now = Math.floor(Date.now() / 1000);
  const esOwner = user.id === room.owner_id;

  // Sesión en vivo + pase vigente (misma fila), bloqueo, membresía y el
  // correo del creador (para la cortesía): una ronda.
  const [session, blocked, membership, owner] = await Promise.all([
    c.env.DB.prepare(
      `SELECT s.*, p.expires_at as pass_expires FROM sessions s
       LEFT JOIN passes p ON p.session_id = s.id AND p.user_id = ? AND p.expires_at > ?
       WHERE s.room_id = ? AND s.status = 'live' ORDER BY p.expires_at DESC LIMIT 1`
    ).bind(user.id, now, room.id).first<Session & { pass_expires: number | null }>(),
    esOwner ? Promise.resolve(false) : isBlocked(c.env.DB, room.id, user.id),
    esOwner
      ? Promise.resolve(null)
      : c.env.DB.prepare(
          "SELECT id, expires_at FROM memberships WHERE room_id = ? AND user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1"
        ).bind(room.id, user.id, now).first<{ id: string; expires_at: number }>(),
    c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(room.owner_id).first<{ email: string }>(),
  ]);
  if (!session) return c.json({ error: "sala_cerrada" }, 400);
  if (blocked) return c.json({ error: "bloqueado" }, 403);
  if (session.pass_expires) return c.json({ ok: true, expires_at: session.pass_expires, charged: false });

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const passId = newId("pass");
  const expiresAt = now + 3600;

  if (esOwner) {
    // el creador entra gratis a su propia sala
    await c.env.DB.prepare(
      "INSERT INTO passes (id, session_id, user_id, expires_at, device_id, amount_cents, creator_cents) VALUES (?, ?, ?, ?, ?, 0, 0)"
    ).bind(passId, session.id, user.id, expiresAt, device_id).run();
    return c.json({ ok: true, expires_at: expiresAt, charged: false });
  }

  // Miembro vigente (ya pagó el mes) o cortesía de la casa (sala de una cuenta
  // de cortesía, o quien entra lo es): entra sin pagar la hora. Se registra el
  // pase igual (cuenta como entrada en estadísticas, con $0); no se mueve
  // dinero, así que no hay recibo.
  const cortesia = !membership && entradaGratis(owner?.email, user.email);
  if (membership || cortesia) {
    await Promise.all([
      c.env.DB.prepare(
        "INSERT INTO passes (id, session_id, user_id, expires_at, device_id, amount_cents, creator_cents) VALUES (?, ?, ?, ?, ?, 0, 0)"
      ).bind(passId, session.id, user.id, expiresAt, device_id).run(),
      stub.fetch("https://do/entrada", { method: "POST", body: JSON.stringify({ name: user.name, creator_cents: 0, member: !!membership, cortesia }) }),
    ]);
    return c.json({ ok: true, expires_at: expiresAt, charged: false, member: !!membership, cortesia });
  }

  const price = room.price_cents || 2000;
  const split = entrySplit(price);
  if (user.balance_cents < price) return c.json({ error: "saldo_insuficiente", price_cents: price }, 402);

  const utm = readUtmCookie(c);
  // Idem key atada a sesión+usuario+segundo: dos clics dobles en el mismo segundo
  // (el caso real de doble-tap) chocan en esta llave y solo uno se cobra.
  const debited = await creditLedger(c.env.DB, user.id, -price, "entrada", passId, `entrada:${session.id}:${user.id}:${now}`, "balance_cents");
  if (!debited) {
    const racedPass = await c.env.DB.prepare(
      "SELECT id, expires_at FROM passes WHERE session_id = ? AND user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1"
    ).bind(session.id, user.id, now).first<{ id: string; expires_at: number }>();
    if (racedPass) return c.json({ ok: true, expires_at: racedPass.expires_at, charged: false });
    return c.json({ error: "no_procesado" }, 500);
  }
  await Promise.all([
    creditLedger(c.env.DB, room.owner_id, split.creator, "ganancia_entrada", passId, `ganancia_entrada:${passId}`, "creator_balance_cents"),
    c.env.DB.prepare(
      `INSERT INTO passes (id, session_id, user_id, expires_at, device_id, utm_source, utm_medium, utm_campaign, amount_cents, creator_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(passId, session.id, user.id, expiresAt, device_id, utm.utm_source ?? null, utm.utm_medium ?? null, utm.utm_campaign ?? null, price, split.creator).run(),
  ]);

  // Aviso a la sala (el creador ve caer el dinero) y hitos que esta entrada
  // pudo desbloquear: para el espectador (primera entrada, madrugador, fiel)
  // y para el creador (primer peso). Todo a la vez.
  const [, newRelics] = await Promise.all([
    stub.fetch("https://do/entrada", { method: "POST", body: JSON.stringify({ name: user.name, creator_cents: split.creator }) }),
    evaluateRelics(c.env, user.id, { sessionId: session.id }),
    evaluateRelics(c.env, room.owner_id, { sessionId: session.id }),
  ]);

  // Recibos a las dos partes (mismo folio, mismo segundo) y aviso al creador
  // por webhook, después de responder: el pase ya quedó cobrado y guardado, y
  // quien entra no tiene por qué esperar a un correo para ver el video.
  afterResponse(c, (async () => {
    await enviarRecibos(c.env, {
      tipo: "entrada",
      id: passId,
      at: now,
      amountCents: price,
      creatorCents: split.creator,
      room,
      viewer: { name: user.name, email: user.email, avatarUrl: user.avatar_url, balanceAfterCents: user.balance_cents - price },
      session: { started_at: session.started_at, ended_at: session.ended_at },
      expiresAt,
    });
    try {
      await emitEvent(c.env, room.owner_id, "viewer.entered", {
        session_id: session.id,
        viewer: { id: user.id, name: user.name },
        amount_cents: price,
        creator_cut_cents: split.creator,
        expires_at: expiresAt,
      });
    } catch (err) {
      console.error("viewer.entered", err);
    }
  })());

  return c.json({ ok: true, expires_at: expiresAt, charged: true, new_relics: newRelics.map(({ code, name, icon, how }) => ({ code, name, icon, how })) });
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
  // Propina de despedida: la sala puede haber cerrado hace un momento y el
  // espectador todavía quiere agradecer — vale la última sesión si terminó
  // hace menos de 10 minutos.
  const session = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE room_id = ? AND (status = 'live' OR ended_at >= ?) ORDER BY started_at DESC LIMIT 1"
  ).bind(room.id, Math.floor(Date.now() / 1000) - FAREWELL_TIP_WINDOW_SECONDS).first<Session>();
  if (!session) return c.json({ error: "sala_cerrada" }, 400);
  if (user.balance_cents < amount_cents) return c.json({ error: "saldo_insuficiente" }, 402);

  const alreadyTipped = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as total FROM tips WHERE session_id = ? AND from_user = ?"
  ).bind(session.id, user.id).first<{ total: number }>();
  if ((alreadyTipped?.total ?? 0) + amount_cents > TIP_SESSION_CAP_CENTS) {
    return c.json({ error: "limite_propinas_alcanzado" }, 400);
  }

  const tipId = newId("tip");
  const creatorCut = tipSplit(amount_cents).creator;
  const now = Math.floor(Date.now() / 1000);
  const debited = await creditLedger(c.env.DB, user.id, -amount_cents, "propina_enviada", tipId, `propina_env:${tipId}`, "balance_cents");
  if (!debited) return c.json({ error: "no_procesado" }, 500);
  await creditLedger(c.env.DB, room.owner_id, creatorCut, "propina_recibida", tipId, `propina_rec:${tipId}`, "creator_balance_cents");
  await c.env.DB.prepare(
    "INSERT INTO tips (id, session_id, from_user, to_user, amount_cents, message, kind) VALUES (?, ?, ?, ?, ?, ?, 'tip')"
  ).bind(tipId, session.id, user.id, room.owner_id, amount_cents, (message ?? "").slice(0, 60)).run();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  if (session.status === "live") {
    await stub.fetch("https://do/tip", {
      method: "POST",
      body: JSON.stringify({ from: user.name, avatar_url: user.avatar_url, amount_cents, creator_cents: creatorCut, message: (message ?? "").slice(0, 60) }),
    });
  }
  await emitEvent(c.env, room.owner_id, "tip.received", {
    session_id: session.id,
    from: { id: user.id, name: user.name },
    amount_cents,
    creator_cut_cents: creatorCut,
    message: (message ?? "").slice(0, 60),
  });
  const [newRelics] = await Promise.all([
    evaluateRelics(c.env, user.id, { sessionId: session.id }),
    evaluateRelics(c.env, room.owner_id, { sessionId: session.id }),
  ]);
  // Recibos a las dos partes, mismo folio, después de responder.
  afterResponse(c, enviarRecibos(c.env, {
    tipo: session.status === "live" ? "propina" : "despedida",
    id: tipId,
    at: now,
    amountCents: amount_cents,
    creatorCents: creatorCut,
    room,
    viewer: { name: user.name, email: user.email, avatarUrl: user.avatar_url, balanceAfterCents: user.balance_cents - amount_cents },
    session: { started_at: session.started_at, ended_at: session.ended_at },
    message: (message ?? "").slice(0, 60),
  }));

  return c.json({ ok: true, creator_cut_cents: creatorCut, new_relics: newRelics.map(({ code, name, icon, how }) => ({ code, name, icon, how })) });
});

// Mensaje destacado pagado: la pregunta queda fijada arriba del chat 3 min
// para todos, con el monto a la vista. Es una propina con el mensaje al frente.
rooms.post("/api/rooms/:slug/highlight", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const { amount_cents, text } = await c.req.json<{ amount_cents: number; text?: string }>().catch(() => ({ amount_cents: 0, text: "" }));
  if (!isHighlightOption(amount_cents)) return c.json({ error: "monto_invalido", allowed: HIGHLIGHT_OPTIONS_CENTS }, 400);
  const body = (text ?? "").trim().slice(0, 140);
  if (!body) return c.json({ error: "vacio" }, 400);

  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'").bind(room.id).first<Session>();
  if (!session) return c.json({ error: "sala_cerrada" }, 400);
  if (await isBlocked(c.env.DB, room.id, user.id)) return c.json({ error: "bloqueado" }, 403);
  if (user.balance_cents < amount_cents) return c.json({ error: "saldo_insuficiente" }, 402);

  const tipId = newId("tip");
  const split = tipSplit(amount_cents);
  const now = Math.floor(Date.now() / 1000);
  const debited = await creditLedger(c.env.DB, user.id, -amount_cents, "destacado_enviado", tipId, `destacado_env:${tipId}`, "balance_cents");
  if (!debited) return c.json({ error: "no_procesado" }, 500);
  await creditLedger(c.env.DB, room.owner_id, split.creator, "destacado_recibido", tipId, `destacado_rec:${tipId}`, "creator_balance_cents");
  await c.env.DB.prepare(
    "INSERT INTO tips (id, session_id, from_user, to_user, amount_cents, message, kind) VALUES (?, ?, ?, ?, ?, ?, 'highlight')"
  ).bind(tipId, session.id, user.id, room.owner_id, amount_cents, body).run();

  const until = Date.now() + HIGHLIGHT_SECONDS * 1000;
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/highlight", {
    method: "POST",
    body: JSON.stringify({ name: user.name, avatar_url: user.avatar_url, body, amount_cents, creator_cents: split.creator, until }),
  });
  await emitEvent(c.env, room.owner_id, "tip.received", {
    session_id: session.id, from: { id: user.id, name: user.name }, amount_cents, creator_cut_cents: split.creator, message: body, kind: "highlight",
  });
  const newRelics = await evaluateRelics(c.env, user.id, { sessionId: session.id });
  // Recibos a las dos partes, mismo folio, después de responder.
  afterResponse(c, enviarRecibos(c.env, {
    tipo: "destacado",
    id: tipId,
    at: now,
    amountCents: amount_cents,
    creatorCents: split.creator,
    room,
    viewer: { name: user.name, email: user.email, avatarUrl: user.avatar_url, balanceAfterCents: user.balance_cents - amount_cents },
    session: { started_at: session.started_at, ended_at: session.ended_at },
    message: body,
    expiresAt: Math.floor(until / 1000),
  }));
  return c.json({ ok: true, until, new_relics: newRelics.map(({ code, name, icon, how }) => ({ code, name, icon, how })) });
});

// Membresía mensual: 30 días entrando sin pagar la hora. Se cobra una vez,
// del saldo; el creador se queda con el 80%.
rooms.post("/api/rooms/:slug/membership", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  if (!room.membership_cents) return c.json({ error: "sin_membresia" }, 400);
  if (user.id === room.owner_id) return c.json({ error: "es_tu_sala" }, 400);
  if (await isBlocked(c.env.DB, room.id, user.id)) return c.json({ error: "bloqueado" }, 403);
  const now = Math.floor(Date.now() / 1000);
  const current = await c.env.DB.prepare(
    "SELECT expires_at FROM memberships WHERE room_id = ? AND user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1"
  ).bind(room.id, user.id, now).first<{ expires_at: number }>();
  if (current) return c.json({ ok: true, already: true, expires_at: current.expires_at });
  const price = room.membership_cents;
  if (user.balance_cents < price) return c.json({ error: "saldo_insuficiente", price_cents: price }, 402);

  const id = newId("mem");
  const split = membershipSplit(price);
  const debited = await creditLedger(c.env.DB, user.id, -price, "membresia", id, `membresia:${id}`, "balance_cents");
  if (!debited) return c.json({ error: "no_procesado" }, 500);
  await creditLedger(c.env.DB, room.owner_id, split.creator, "ganancia_membresia", id, `ganancia_membresia:${id}`, "creator_balance_cents");
  const expiresAt = now + MEMBERSHIP_DAYS * 86400;
  await c.env.DB.prepare(
    "INSERT INTO memberships (id, room_id, user_id, price_cents, creator_cents, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, room.id, user.id, price, split.creator, expiresAt).run();
  await emitEvent(c.env, room.owner_id, "tip.received", {
    kind: "membership", from: { id: user.id, name: user.name }, amount_cents: price, creator_cut_cents: split.creator, expires_at: expiresAt,
  });
  // Recibos a las dos partes, mismo folio, después de responder. La sesión
  // en vivo (si la hay) se busca allá, fuera del camino de la respuesta.
  afterResponse(c, enviarRecibos(c.env, {
    tipo: "membresia",
    id,
    at: now,
    amountCents: price,
    creatorCents: split.creator,
    room,
    viewer: { name: user.name, email: user.email, avatarUrl: user.avatar_url, balanceAfterCents: user.balance_cents - price },
    expiresAt,
  }));
  return c.json({ ok: true, expires_at: expiresAt, charged: true });
});

// Lo que el espectador necesita saber antes de pagar: precio, si hay
// membresía y si ya es miembro.
rooms.get("/api/rooms/:slug/offer", async (c) => {
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const [user, owner] = await Promise.all([
    currentUser(c),
    c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(room.owner_id).first<{ email: string }>(),
  ]);
  let memberUntil: number | null = null;
  if (user) {
    const m = await c.env.DB.prepare(
      "SELECT expires_at FROM memberships WHERE room_id = ? AND user_id = ? AND expires_at > unixepoch() ORDER BY expires_at DESC LIMIT 1"
    ).bind(room.id, user.id).first<{ expires_at: number }>();
    memberUntil = m?.expires_at ?? null;
  }
  const cortesia = entradaGratis(owner?.email, user?.email);
  return c.json({
    price_cents: cortesia ? 0 : room.price_cents || 2000,
    cortesia,
    membership_cents: cortesia ? null : room.membership_cents,
    tip_goal_cents: room.tip_goal_cents,
    highlight_options_cents: HIGHLIGHT_OPTIONS_CENTS,
    member_until: memberUntil,
  });
});

// El creador decide cuánto cobra. Opciones acotadas: precios claros, sin
// decimales raros, y el reparto siempre a la vista en el monedero.
rooms.post("/api/rooms/:slug/settings", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{ price_cents?: number; membership_cents?: number | null; tip_goal_cents?: number | null }>().catch(() => ({} as { price_cents?: number; membership_cents?: number | null; tip_goal_cents?: number | null }));
  const price = body.price_cents ?? room.price_cents;
  if (!isPriceOption(price)) return c.json({ error: "precio_invalido", allowed: PRICE_OPTIONS_CENTS }, 400);
  const membership = body.membership_cents === undefined ? room.membership_cents : body.membership_cents;
  if (membership !== null && !isMembershipOption(membership)) return c.json({ error: "membresia_invalida", allowed: MEMBERSHIP_OPTIONS_CENTS }, 400);
  const goal = body.tip_goal_cents === undefined ? room.tip_goal_cents : body.tip_goal_cents;
  if (goal !== null && (!Number.isInteger(goal) || goal < 10000 || goal > 10000000)) return c.json({ error: "meta_invalida", hint: "Entre $100 y $100,000" }, 400);
  await c.env.DB.prepare("UPDATE rooms SET price_cents = ?, membership_cents = ?, tip_goal_cents = ? WHERE id = ?").bind(price, membership, goal, room.id).run();
  return c.json({ ok: true, price_cents: price, membership_cents: membership, tip_goal_cents: goal, split: entrySplit(price), membership_split: membership ? membershipSplit(membership) : null });
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
    if (await isBlocked(c.env.DB, room.id, user.id)) return c.json({ error: "bloqueado" }, 403);
    const now = Math.floor(Date.now() / 1000);
    const validPass = await c.env.DB.prepare(
      "SELECT id FROM passes WHERE session_id = ? AND user_id = ? AND expires_at > ?"
    ).bind(session.id, user.id, now).first();
    if (!validPass) return c.json({ error: "sin_pase" }, 402);
    // Silenciado: a diferencia de bloqueado, la persona no se entera — su
    // comentario "se manda" pero nunca llega a nadie ni queda guardado.
    if (await isMuted(c.env.DB, room.id, user.id)) return c.json({ ok: true });
  }

  const commentId = newId("cmt");
  await c.env.DB.prepare(
    "INSERT INTO comments (id, session_id, user_id, body) VALUES (?, ?, ?, ?)"
  ).bind(commentId, session.id, user.id, body).run();

  // La marca de rango del espectador (◆ Asiduo, ✦ Mecenas) viaja con el
  // comentario: es estatus que se ve donde más importa, en vivo.
  const mark = user.id === room.owner_id ? null : await viewerMarkFor(c.env, user.id).catch(() => null);
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const r = await stub.fetch("https://do/comment", {
    method: "POST",
    body: JSON.stringify({
      id: commentId,
      user_id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      mark,
      body,
      is_owner: user.id === room.owner_id,
    }),
  });
  if (r.status === 429) {
    // Freno del chat: el comentario no entró; se borra para no inflar nada.
    await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run().catch(() => {});
    return c.json({ error: "despacio" }, 429);
  }
  const { seq } = await r.json<{ seq?: number }>().catch(() => ({ seq: undefined }));
  return c.json({ ok: true, seq });
});

// Historial del chat de la transmisión en curso: páginas hacia atrás
// (?antes=<seq>), relleno tras reconectar (?desde=<seq>) y búsqueda. Vive en
// el Durable Object y se borra al terminar; aquí solo se comprueba quién pide.
rooms.get("/api/rooms/:slug/chat", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string }>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const u = new URL("https://do/chat");
  for (const k of ["antes", "desde", "n"]) { const v = c.req.query(k); if (v) u.searchParams.set(k, v); }
  const r = await stub.fetch(u.toString());
  return c.json(await r.json(), 200, { "Cache-Control": "no-store" });
});

rooms.get("/api/rooms/:slug/chat/buscar", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const room = await c.env.DB.prepare("SELECT id FROM rooms WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string }>();
  if (!room) return c.json({ error: "not_found" }, 404);
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const u = new URL("https://do/chat/buscar");
  u.searchParams.set("q", c.req.query("q") || "");
  u.searchParams.set("de", c.req.query("de") || "");
  u.searchParams.set("uid", user.id);
  const r = await stub.fetch(u.toString());
  return c.json(await r.json(), 200, { "Cache-Control": "no-store" });
});

rooms.post("/api/rooms/:slug/block", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { user_id: targetUserId } = await c.req.json<{ user_id: string }>().catch(() => ({ user_id: "" }));
  if (!targetUserId) return c.json({ error: "user_id_requerido" }, 400);
  // Bloquear es permanente: además de impedir que vuelva a entrar (ya
  // validado en /pass y /comment vía isBlocked), se le quita cualquier aviso
  // pendiente y se corta su conexión en vivo ahora mismo — "no le vuelve a
  // mandar nada" no puede ser parcial.
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO blocked_viewers (room_id, user_id) VALUES (?, ?)").bind(room.id, targetUserId),
    c.env.DB.prepare("DELETE FROM notify_me WHERE room_id = ? AND user_id = ?").bind(room.id, targetUserId),
  ]);

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/kick-user", { method: "POST", body: JSON.stringify({ user_id: targetUserId, reason: "blocked" }) });

  return c.json({ ok: true });
});

rooms.post("/api/rooms/:slug/unblock", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { user_id: targetUserId } = await c.req.json<{ user_id: string }>().catch(() => ({ user_id: "" }));
  if (!targetUserId) return c.json({ error: "user_id_requerido" }, 400);
  await c.env.DB.prepare("DELETE FROM blocked_viewers WHERE room_id = ? AND user_id = ?").bind(room.id, targetUserId).run();
  return c.json({ ok: true });
});

rooms.post("/api/rooms/:slug/notify-me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);
  if (await isBlocked(c.env.DB, room.id, user.id)) return c.json({ error: "bloqueado" }, 403);
  const ins = await c.env.DB.prepare("INSERT OR IGNORE INTO notify_me (room_id, user_id) VALUES (?, ?)").bind(room.id, user.id).run();

  // Solo la primera vez (INSERT real, no un re-clic): el creador se entera de
  // que alguien lo espera — la señal más temprana de demanda que tiene.
  if (ins.meta.changes > 0 && user.id !== room.owner_id) {
    const [owner, count] = await Promise.all([
      c.env.DB.prepare("SELECT name, email, avatar_url FROM users WHERE id = ?").bind(room.owner_id).first<{ name: string; email: string; avatar_url: string | null }>(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM notify_me WHERE room_id = ?").bind(room.id).first<{ n: number }>(),
    ]);
    const followerCount = count?.n ?? 1;
    if (owner) {
      try {
        await sendEmail(c.env.RESEND_API_KEY, {
          to: owner.email,
          ...newFollowerEmail({
            appUrl: c.env.APP_URL,
            creatorName: owner.name,
            creatorAvatar: owner.avatar_url,
            followerName: user.name,
            followerAvatar: user.avatar_url,
            followerCount,
            roomUrl: `${c.env.APP_URL}/${room.slug}`,
          }),
        });
      } catch (err) {
        console.error("newFollowerEmail", err);
      }
    }
    await emitEvent(c.env, room.owner_id, "follower.added", {
      follower: { id: user.id, name: user.name },
      followers: followerCount,
    });
  }
  return c.json({ ok: true });
});

rooms.post("/api/rooms/:slug/mute", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { user_id: targetUserId } = await c.req.json<{ user_id: string }>().catch(() => ({ user_id: "" }));
  if (!targetUserId) return c.json({ error: "user_id_requerido" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO muted_viewers (room_id, user_id) VALUES (?, ?)").bind(room.id, targetUserId).run();
  return c.json({ ok: true });
});

rooms.post("/api/rooms/:slug/unmute", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { user_id: targetUserId } = await c.req.json<{ user_id: string }>().catch(() => ({ user_id: "" }));
  if (!targetUserId) return c.json({ error: "user_id_requerido" }, 400);
  await c.env.DB.prepare("DELETE FROM muted_viewers WHERE room_id = ? AND user_id = ?").bind(room.id, targetUserId).run();
  return c.json({ ok: true });
});

// A diferencia de bloquear, expulsar no deja ningún registro permanente — solo
// corta la conexión de este momento. La persona puede volver a entrar (y a
// pagar) si quiere.
rooms.post("/api/rooms/:slug/kick", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { user_id: targetUserId } = await c.req.json<{ user_id: string }>().catch(() => ({ user_id: "" }));
  if (!targetUserId) return c.json({ error: "user_id_requerido" }, 400);

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/kick-user", { method: "POST", body: JSON.stringify({ user_id: targetUserId, reason: "kicked" }) });
  return c.json({ ok: true });
});

rooms.post("/api/rooms/:slug/like-comment", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { comment_id: commentId } = await c.req.json<{ comment_id: string }>().catch(() => ({ comment_id: "" }));
  if (!commentId) return c.json({ error: "comment_id_requerido" }, 400);
  await c.env.DB.prepare("UPDATE comments SET likes = likes + 1 WHERE id = ?").bind(commentId).run();
  const updated = await c.env.DB.prepare("SELECT likes FROM comments WHERE id = ?").bind(commentId).first<{ likes: number }>();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/comment-liked", {
    method: "POST",
    body: JSON.stringify({ comment_id: commentId, likes: updated?.likes ?? 0 }),
  });
  return c.json({ ok: true, likes: updated?.likes ?? 0 });
});

// Lista de espectadores conectados ahora mismo, ordenada de mayor a menor
// donador (entradas + propinas de ESTA transmisión) — exclusiva del creador,
// para que sepa a quién está atendiendo antes de moderar.
rooms.get("/api/rooms/:slug/viewers", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();
  if (!session) return c.json({ viewers: [] });

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const connRes = await stub.fetch("https://do/connected-uids");
  const { uids } = await connRes.json<{ uids: string[] }>();
  if (uids.length === 0) return c.json({ viewers: [] });

  const placeholders = uids.map(() => "?").join(",");
  const [usersRes, entradasRes, tipsRes, blockedRes, mutedRes] = await Promise.all([
    c.env.DB.prepare(`SELECT id, name, avatar_url FROM users WHERE id IN (${placeholders})`)
      .bind(...uids).all<{ id: string; name: string; avatar_url: string | null }>(),
    c.env.DB.prepare(
      `SELECT user_id, COALESCE(SUM(amount_cents), 0) as cents FROM passes WHERE session_id = ? AND user_id IN (${placeholders}) GROUP BY user_id`
    ).bind(session.id, ...uids).all<{ user_id: string; cents: number }>(),
    c.env.DB.prepare(
      `SELECT from_user as user_id, COALESCE(SUM(amount_cents), 0) as cents FROM tips WHERE session_id = ? AND from_user IN (${placeholders}) GROUP BY from_user`
    ).bind(session.id, ...uids).all<{ user_id: string; cents: number }>(),
    c.env.DB.prepare(`SELECT user_id FROM blocked_viewers WHERE room_id = ? AND user_id IN (${placeholders})`)
      .bind(room.id, ...uids).all<{ user_id: string }>(),
    c.env.DB.prepare(`SELECT user_id FROM muted_viewers WHERE room_id = ? AND user_id IN (${placeholders})`)
      .bind(room.id, ...uids).all<{ user_id: string }>(),
  ]);

  const centsByUser = new Map<string, number>();
  for (const row of entradasRes.results) centsByUser.set(row.user_id, (centsByUser.get(row.user_id) ?? 0) + row.cents);
  for (const row of tipsRes.results) centsByUser.set(row.user_id, (centsByUser.get(row.user_id) ?? 0) + row.cents);
  const blockedSet = new Set(blockedRes.results.map((r) => r.user_id));
  const mutedSet = new Set(mutedRes.results.map((r) => r.user_id));

  const viewers = usersRes.results
    .map((u) => ({
      user_id: u.id,
      name: u.name,
      avatar_url: u.avatar_url,
      total_cents: centsByUser.get(u.id) ?? 0,
      is_muted: mutedSet.has(u.id),
      is_blocked: blockedSet.has(u.id),
    }))
    .sort((a, b) => b.total_cents - a.total_cents);

  return c.json({ viewers });
});
