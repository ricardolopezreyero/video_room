// RLR
import type { Env } from "../env";

interface TipEvent {
  from: string;
  avatar_url?: string | null;
  amount_cents: number;
  message?: string;
}

interface PersistedState {
  totalCents: number;
  peakViewers: number;
  hearts: number;
  sessionId: string | null;
  sfuSessionId: string | null;
  sfuTracks: { mid: string; trackName: string }[];
}

// Cloudflare puede hibernar este Durable Object (evictarlo de memoria) mientras
// los WebSockets siguen abiertos en el edge — es el propósito de acceptWebSocket().
// Por eso NUNCA guardamos el estado importante solo en memoria: se persiste en
// this.state.storage y se recupera en el constructor, y los sockets se leen con
// getWebSockets() en vez de una lista propia (que se perdería al re-instanciar).
export class RoomDurableObject implements DurableObject {
  state: DurableObjectState;
  env: Env;
  totalCents = 0;
  peakViewers = 0;
  hearts = 0;
  sessionId: string | null = null;
  sfuSessionId: string | null = null;
  sfuTracks: { mid: string; trackName: string }[] = [];
  private ready: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<PersistedState>("state");
      if (stored) {
        this.totalCents = stored.totalCents;
        this.peakViewers = stored.peakViewers;
        this.hearts = stored.hearts;
        this.sessionId = stored.sessionId;
        this.sfuSessionId = stored.sfuSessionId;
        this.sfuTracks = stored.sfuTracks;
      }
    });
  }

  private async persist() {
    const data: PersistedState = {
      totalCents: this.totalCents,
      peakViewers: this.peakViewers,
      hearts: this.hearts,
      sessionId: this.sessionId,
      sfuSessionId: this.sfuSessionId,
      sfuTracks: this.sfuTracks,
    };
    await this.state.storage.put("state", data);
  }

  // No cuenta la conexión del propio creador — si no, "cuánta gente me está
  // viendo" y el "pico de espectadores" al terminar quedarían inflados por su
  // propia pestaña abierta.
  private viewerCount(): number {
    return this.state.getWebSockets().filter((ws) => {
      const attachment = ws.deserializeAttachment() as { isOwner?: boolean } | null;
      return !attachment?.isOwner;
    }).length;
  }

  broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // socket muerto, se limpia solo al hibernar/cerrar
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      // Etiqueta la conexión con quién es (uid) y desde qué pestaña/dispositivo
      // (cid) — serializeAttachment() sobrevive a la hibernación, a diferencia
      // de una variable en memoria. Esto es lo que permite, más abajo, avisarle
      // a cualquier OTRA conexión de la misma cuenta que se apague sola cuando
      // un dispositivo nuevo empieza a ver la transmisión.
      const uid = url.searchParams.get("uid");
      const cid = url.searchParams.get("cid");
      const isOwner = url.searchParams.get("owner") === "1";
      if (uid && cid) server.serializeAttachment({ uid, cid, isOwner });
      const count = this.viewerCount();
      this.peakViewers = Math.max(this.peakViewers, count);
      await this.persist();
      this.broadcast({ type: "viewers", count });
      return new Response(null, { status: 101, webSocket: client });
    }

    // Un mismo usuario solo puede ver la transmisión activamente desde un
    // dispositivo a la vez — cuando uno nuevo empieza a ver, se avisa y se
    // cierra la conexión vieja de esa misma cuenta (no cobra de nuevo, solo
    // deja de recibir video ahí).
    if (url.pathname === "/kick-other-devices" && request.method === "POST") {
      const { uid, keep_cid } = await request.json<{ uid: string; keep_cid: string }>();
      for (const ws of this.state.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as { uid?: string; cid?: string; isOwner?: boolean } | null;
        if (attachment?.uid === uid && attachment.cid !== keep_cid) {
          try {
            ws.send(JSON.stringify({ type: "kicked" }));
            ws.close(4000, "sesion movida a otro dispositivo");
          } catch {
            // ya estaba cerrada
          }
        }
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === "/start" && request.method === "POST") {
      const body = await request.json<{ sessionId: string }>();
      this.sessionId = body.sessionId;
      this.totalCents = 0;
      this.peakViewers = this.viewerCount();
      this.hearts = 0;
      await this.persist();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/stop" && request.method === "POST") {
      const summary = {
        earned_cents: this.totalCents,
        peak_viewers: this.peakViewers,
        hearts: this.hearts,
      };
      this.broadcast({ type: "ended" });
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.close(1000, "sesión terminada");
        } catch {
          // ya cerrado
        }
      }
      this.sessionId = null;
      this.sfuSessionId = null;
      this.sfuTracks = [];
      this.totalCents = 0;
      this.peakViewers = 0;
      this.hearts = 0;
      await this.persist();
      return Response.json(summary);
    }

    if (url.pathname === "/entrada" && request.method === "POST") {
      const { name } = await request.json<{ name: string }>();
      this.totalCents += 1000;
      await this.persist();
      this.broadcast({ type: "entrada", name, ticker_cents: this.totalCents });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/set-sfu-session" && request.method === "POST") {
      const body = await request.json<{ sfuSessionId: string; tracks: { mid: string; trackName: string }[] }>();
      this.sfuSessionId = body.sfuSessionId;
      this.sfuTracks = body.tracks;
      await this.persist();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/sfu-session") {
      return Response.json({ sfuSessionId: this.sfuSessionId, tracks: this.sfuTracks, viewerCount: this.viewerCount() });
    }

    if (url.pathname === "/comment" && request.method === "POST") {
      const { id, user_id, name, avatar_url, body, is_owner } = await request.json<{
        id: string;
        user_id: string;
        name: string;
        avatar_url?: string | null;
        body: string;
        is_owner?: boolean;
      }>();
      this.broadcast({ type: "comment", id, user_id, name, avatar_url: avatar_url ?? null, body, is_owner: !!is_owner, ts: Date.now() });
      return Response.json({ ok: true });
    }

    // El creador acaba de darle like a un comentario (fuera de este DO, en
    // D1) — solo reenvía el conteo actualizado a todos en vivo.
    if (url.pathname === "/comment-liked" && request.method === "POST") {
      const { comment_id, likes } = await request.json<{ comment_id: string; likes: number }>();
      this.broadcast({ type: "comment_liked", comment_id, likes });
      return Response.json({ ok: true });
    }

    // Expulsar (temporal) o bloquear (permanente, ya validado en D1 antes de
    // llegar aquí) a un espectador específico — a diferencia de
    // /kick-other-devices, que apaga las OTRAS conexiones de la MISMA cuenta,
    // esto corta la conexión de OTRA persona por decisión del creador.
    if (url.pathname === "/kick-user" && request.method === "POST") {
      const { user_id, reason } = await request.json<{ user_id: string; reason?: string }>();
      for (const ws of this.state.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as { uid?: string; isOwner?: boolean } | null;
        if (attachment?.uid === user_id && !attachment.isOwner) {
          try {
            ws.send(JSON.stringify({ type: "kicked", reason: reason ?? "kicked" }));
            ws.close(4001, reason ?? "kicked");
          } catch {
            // ya estaba cerrada
          }
        }
      }
      return Response.json({ ok: true });
    }

    // ids únicos de espectadores conectados ahora mismo (sin el creador) —
    // rooms.ts cruza esto con D1 para armar la lista ordenada por donación.
    if (url.pathname === "/connected-uids") {
      const uids = new Set<string>();
      for (const ws of this.state.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as { uid?: string; isOwner?: boolean } | null;
        if (attachment?.uid && !attachment.isOwner) uids.add(attachment.uid);
      }
      return Response.json({ uids: [...uids] });
    }

    if (url.pathname === "/tip" && request.method === "POST") {
      const tip = await request.json<TipEvent>();
      const creatorCut = Math.round(tip.amount_cents * 0.9);
      this.totalCents += creatorCut;
      await this.persist();
      this.broadcast({
        type: "tip",
        from: tip.from,
        avatar_url: tip.avatar_url ?? null,
        amount_cents: tip.amount_cents,
        message: tip.message ?? "",
        ticker_cents: this.totalCents,
      });
      return Response.json({ ok: true });
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      if (data.type === "heart") {
        this.hearts++;
        await this.persist();
        this.broadcast({ type: "hearts", count: this.hearts });
      }
      if (data.type === "raise_hand") {
        this.broadcast({ type: "raise_hand", user_id: data.user_id, name: data.name });
      }
      // Fijar un comentario sí puede afectar lo que ve toda la sala, a
      // diferencia de un corazón o una mano levantada — por eso, a diferencia
      // de esos dos, se verifica contra la etiqueta real de la conexión
      // (serializeAttachment en /ws) en vez de confiar en lo que mande el
      // cliente.
      if (data.type === "pin" || data.type === "unpin") {
        const attachment = ws.deserializeAttachment() as { isOwner?: boolean } | null;
        if (attachment?.isOwner) {
          if (data.type === "pin" && typeof data.name === "string" && typeof data.body === "string") {
            this.broadcast({
              type: "pinned",
              name: data.name.slice(0, 60),
              body: data.body.slice(0, 240),
              avatar_url: typeof data.avatar_url === "string" ? data.avatar_url : null,
            });
          } else if (data.type === "unpin") {
            this.broadcast({ type: "unpinned" });
          }
        }
      }
    } catch {
      // ignora mensajes malformados
    }
  }

  async webSocketClose(_ws: WebSocket) {
    this.broadcast({ type: "viewers", count: this.viewerCount() });
  }

  async webSocketError(_ws: WebSocket) {
    this.broadcast({ type: "viewers", count: this.viewerCount() });
  }
}
