import type { Env } from "../env";

interface TipEvent {
  from: string;
  amount_cents: number;
  message?: string;
}

export class RoomDurableObject implements DurableObject {
  state: DurableObjectState;
  env: Env;
  sockets: Set<WebSocket> = new Set();
  viewerCount = 0;
  totalCents = 0;
  peakViewers = 0;
  hearts = 0;
  sessionId: string | null = null;
  sfuSessionId: string | null = null;
  sfuTracks: { mid: string; trackName: string }[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets) {
      try {
        ws.send(data);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      this.sockets.add(server);
      this.viewerCount++;
      this.peakViewers = Math.max(this.peakViewers, this.viewerCount);
      this.broadcast({ type: "viewers", count: this.viewerCount });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/start" && request.method === "POST") {
      const body = await request.json<{ sessionId: string }>();
      this.sessionId = body.sessionId;
      this.totalCents = 0;
      this.viewerCount = 0;
      this.peakViewers = 0;
      this.hearts = 0;
      return Response.json({ ok: true });
    }

    if (url.pathname === "/stop" && request.method === "POST") {
      const summary = {
        earned_cents: this.totalCents,
        peak_viewers: this.peakViewers,
        hearts: this.hearts,
      };
      this.broadcast({ type: "ended" });
      for (const ws of this.sockets) ws.close(1000, "sesión terminada");
      this.sockets.clear();
      this.sessionId = null;
      this.sfuSessionId = null;
      this.sfuTracks = [];
      return Response.json(summary);
    }

    if (url.pathname === "/entrada" && request.method === "POST") {
      const { name } = await request.json<{ name: string }>();
      this.totalCents += 1000;
      this.broadcast({ type: "entrada", name, ticker_cents: this.totalCents });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/set-sfu-session" && request.method === "POST") {
      const body = await request.json<{ sfuSessionId: string; tracks: { mid: string; trackName: string }[] }>();
      this.sfuSessionId = body.sfuSessionId;
      this.sfuTracks = body.tracks;
      return Response.json({ ok: true });
    }

    if (url.pathname === "/sfu-session") {
      return Response.json({ sfuSessionId: this.sfuSessionId, tracks: this.sfuTracks });
    }

    if (url.pathname === "/tip" && request.method === "POST") {
      const tip = await request.json<TipEvent>();
      const creatorCut = Math.round(tip.amount_cents * 0.9);
      this.totalCents += creatorCut;
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
        this.broadcast({ type: "hearts", count: this.hearts });
      }
      if (data.type === "raise_hand") {
        this.broadcast({ type: "raise_hand", user_id: data.user_id, name: data.name });
      }
    } catch {
      // ignora mensajes malformados
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.sockets.delete(ws);
    this.viewerCount = Math.max(0, this.viewerCount - 1);
    this.broadcast({ type: "viewers", count: this.viewerCount });
  }
}
