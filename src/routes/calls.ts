import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import type { Env } from "../env";
import { isBlocked, type Room, type Session } from "../lib/db";

export const calls = new Hono<{ Bindings: Env }>();

function callsUrl(env: Env, path: string): string {
  return `https://rtc.live.cloudflare.com/v1/apps/${env.CALLS_APP_ID}${path}`;
}

function callsHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CALLS_APP_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function newCallsSession(env: Env): Promise<string> {
  const res = await fetch(callsUrl(env, "/sessions/new"), { method: "POST", headers: callsHeaders(env) });
  if (!res.ok) throw new Error(`calls sessions/new: ${await res.text()}`);
  const json = await res.json<{ sessionId: string }>();
  return json.sessionId;
}

// El creador publica su cámara/pantalla: crea su sesión SFU y sube tracks locales.
calls.post("/api/rooms/:slug/publish", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room || room.owner_id !== user.id) return c.json({ error: "forbidden" }, 403);

  const { sdp, tracks } = await c.req.json<{ sdp: string; tracks: { mid: string; trackName: string }[] }>();
  const sfuSessionId = await newCallsSession(c.env);

  const res = await fetch(callsUrl(c.env, `/sessions/${sfuSessionId}/tracks/new`), {
    method: "POST",
    headers: callsHeaders(c.env),
    body: JSON.stringify({
      sessionDescription: { type: "offer", sdp },
      tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
    }),
  });
  if (!res.ok) return c.json({ error: "calls_error", detail: await res.text() }, 502);
  const json = await res.json<{ sessionDescription: { sdp: string } }>();

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  await stub.fetch("https://do/set-sfu-session", { method: "POST", body: JSON.stringify({ sfuSessionId, tracks }) });

  return c.json({ sfu_session_id: sfuSessionId, answer_sdp: json.sessionDescription.sdp });
});

// El espectador jala los tracks remotos del creador hacia su propia sesión SFU.
calls.post("/api/rooms/:slug/subscribe", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.json({ error: "not_found" }, 404);

  if (user.id !== room.owner_id) {
    if (await isBlocked(c.env.DB, room.id, user.id)) return c.json({ error: "bloqueado" }, 403);
    const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
      .bind(room.id)
      .first<Session>();
    if (!session) return c.json({ error: "creador_no_transmitiendo" }, 400);
    const now = Math.floor(Date.now() / 1000);
    const validPass = await c.env.DB.prepare(
      "SELECT id FROM passes WHERE session_id = ? AND user_id = ? AND expires_at > ?"
    ).bind(session.id, user.id, now).first();
    if (!validPass) return c.json({ error: "sin_pase" }, 402);
  }

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const infoRes = await stub.fetch("https://do/sfu-session");
  const info = await infoRes.json<{ sfuSessionId: string | null; tracks: { mid: string; trackName: string }[] }>();
  if (!info.sfuSessionId) return c.json({ error: "creador_no_transmitiendo" }, 400);

  // El creador publica audio + 3 calidades de video (video_low/medium/high) —
  // el espectador solo jala la calidad que quiere ver, para no gastar ancho de
  // banda en resoluciones que ni siquiera va a mostrar. Si por lo que sea los
  // nombres no calzan (ej. un cliente viejo durante un deploy), se cae de
  // vuelta a pedir todos los tracks, como antes.
  const { quality, cid } = await c.req.json<{ quality?: "low" | "medium" | "high" | "off"; cid?: string }>()
    .catch(() => ({ quality: undefined, cid: undefined }));
  const wantedNames = quality === "off" ? ["audio"] : ["audio", `video_${quality ?? "high"}`];
  const filtered = info.tracks.filter((t) => wantedNames.includes(t.trackName));
  const tracksToRequest = filtered.length > 0 ? filtered : info.tracks;

  // Una sola cuenta solo puede estar viendo activamente desde un dispositivo a
  // la vez — si esta misma cuenta ya tenía otra pestaña/dispositivo conectado
  // (identificado por un cid distinto), se le avisa y se apaga sola allá. No
  // bloquea la respuesta si por lo que sea falla.
  if (cid) {
    await stub.fetch("https://do/kick-other-devices", {
      method: "POST",
      body: JSON.stringify({ uid: user.id, keep_cid: cid }),
    }).catch(() => {});
  }

  const viewerSessionId = await newCallsSession(c.env);
  const res = await fetch(callsUrl(c.env, `/sessions/${viewerSessionId}/tracks/new`), {
    method: "POST",
    headers: callsHeaders(c.env),
    body: JSON.stringify({
      tracks: tracksToRequest.map((t) => ({ location: "remote", sessionId: info.sfuSessionId, trackName: t.trackName })),
    }),
  });
  if (!res.ok) return c.json({ error: "calls_error", detail: await res.text() }, 502);
  const json = await res.json<{ sessionDescription?: { sdp: string }; requiresImmediateRenegotiation: boolean }>();

  return c.json({
    viewer_session_id: viewerSessionId,
    offer_sdp: json.sessionDescription?.sdp ?? null,
    requires_renegotiation: json.requiresImmediateRenegotiation,
  });
});

calls.post("/api/rooms/:slug/renegotiate", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const { session_id, sdp } = await c.req.json<{ session_id: string; sdp: string }>();
  const res = await fetch(callsUrl(c.env, `/sessions/${session_id}/renegotiate`), {
    method: "PUT",
    headers: callsHeaders(c.env),
    body: JSON.stringify({ sessionDescription: { type: "answer", sdp } }),
  });
  if (!res.ok) return c.json({ error: "calls_error", detail: await res.text() }, 502);
  return c.json({ ok: true });
});
