// RLR
import type { Env } from "../env";

interface TipEvent {
  from: string;
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

  private viewerCount(): number {
    return this.state.getWebSockets().length;
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
      const count = this.viewerCount();
      this.peakViewers = Math.max(this.peakViewers, count);
      await this.persist();
      this.broadcast({ type: "viewers", count });
      return new Response(null, { status: 101, webSocket: client });
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
      const { name, body } = await request.json<{ name: string; body: string }>();
      this.broadcast({ type: "comment", name, body, ts: Date.now() });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/tip" && request.method === "POST") {
      const tip = await request.json<TipEvent>();
      const creatorCut = Math.round(tip.amount_cents * 0.9);
      this.totalCents += creatorCut;
      await this.persist();
      this.broadcast({
        type: "tip",
        from: tip.from,
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
