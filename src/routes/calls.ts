import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import type { Env } from "../env";
import { isBlocked, type Room, type Session } from "../lib/db";
import { afterResponse } from "../lib/segundo-plano";

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
  // Camino hacia el primer cuadro de video: lo que eran nueve pasos en serie
  // son tres rondas en paralelo. La sesión del espectador en Calls se pide
  // desde el primer instante, porque no depende de nada de lo demás.
  const slug = c.req.param("slug");
  const viewerSessionP: Promise<string | Error> = newCallsSession(c.env).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));
  const [user, room, body] = await Promise.all([
    currentUser(c),
    c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>(),
    c.req.json<{ quality?: "low" | "medium" | "high" | "off"; cid?: string }>().catch(() => ({ quality: undefined, cid: undefined })),
  ]);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (!room) return c.json({ error: "not_found" }, 404);
  const esOwner = user.id === room.owner_id;
  const now = Math.floor(Date.now() / 1000);
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));

  // Bloqueo, sesión en vivo + pase vigente (misma fila) y estado del SFU: una ronda.
  const [blocked, acceso, infoRes] = await Promise.all([
    esOwner ? Promise.resolve(false) : isBlocked(c.env.DB, room.id, user.id),
    esOwner
      ? Promise.resolve(null)
      : c.env.DB.prepare(
          `SELECT s.id as session_id, p.id as pass_id FROM sessions s
           LEFT JOIN passes p ON p.session_id = s.id AND p.user_id = ? AND p.expires_at > ?
           WHERE s.room_id = ? AND s.status = 'live' ORDER BY p.expires_at DESC LIMIT 1`
        ).bind(user.id, now, room.id).first<{ session_id: string; pass_id: string | null }>(),
    stub.fetch("https://do/sfu-session"),
  ]);
  if (!esOwner) {
    if (blocked) return c.json({ error: "bloqueado" }, 403);
    if (!acceso) return c.json({ error: "creador_no_transmitiendo" }, 400);
    if (!acceso.pass_id) return c.json({ error: "sin_pase" }, 402);
  }
  const info = await infoRes.json<{ sfuSessionId: string | null; tracks: { mid: string; trackName: string }[] }>();
  if (!info.sfuSessionId) return c.json({ error: "creador_no_transmitiendo" }, 400);

  // El creador publica audio + 3 calidades de video (video_low/medium/high) —
  // el espectador solo jala la calidad que quiere ver, para no gastar ancho de
  // banda en resoluciones que ni siquiera va a mostrar. Si por lo que sea los
  // nombres no calzan (ej. un cliente viejo durante un deploy), se cae de
  // vuelta a pedir todos los tracks, como antes.
  const { quality, cid } = body;
  const wantedNames = quality === "off" ? ["audio"] : ["audio", `video_${quality ?? "high"}`];
  const filtered = info.tracks.filter((t) => wantedNames.includes(t.trackName));
  const tracksToRequest = filtered.length > 0 ? filtered : info.tracks;

  // Una sola cuenta solo puede estar viendo activamente desde un dispositivo a
  // la vez — si esta misma cuenta ya tenía otra pestaña/dispositivo conectado
  // (identificado por un cid distinto), se le avisa y se apaga sola allá. No
  // forma parte de esta respuesta: sale después de responder.
  if (cid) {
    afterResponse(c, stub.fetch("https://do/kick-other-devices", { method: "POST", body: JSON.stringify({ uid: user.id, keep_cid: cid }) }));
  }

  const viewerSessionId = await viewerSessionP;
  if (viewerSessionId instanceof Error) return c.json({ error: "calls_error", detail: viewerSessionId.message }, 502);
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
