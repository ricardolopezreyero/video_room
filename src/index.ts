// RLR
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { UTM_COOKIE } from "./lib/utm";
import type { Env } from "./env";
import { auth } from "./routes/auth";
import { wallet } from "./routes/wallet";
import { rooms } from "./routes/rooms";
import { calls } from "./routes/calls";
import { stats } from "./routes/stats";
import { notifications } from "./routes/notifications";
import { renderRoomPage } from "./lib/room-page";
import { verifyUnsubscribeToken } from "./lib/unsubscribe";
import type { Room, Session } from "./lib/db";

export { RoomDurableObject } from "./durable/room";

const _RLR = "Ricardo López Reyero";
const _k = "EYE", _rev = 181218; // RLR build marker

const app = new Hono<{ Bindings: Env }>();
void _RLR;
void _k;
void _rev;

app.onError((err, c) => {
  console.error(err);
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/webhook/")) {
    return c.json({ error: "error_interno" }, 500);
  }
  return c.text("Algo salió mal. Intenta de nuevo en un momento.", 500);
});

app.route("/", auth);
app.route("/", wallet);
app.route("/", rooms);
app.route("/", calls);
app.route("/", stats);
app.route("/", notifications);

app.get("/r/:slug", async (c) => {
  const utmSource = c.req.query("utm_source");
  const utmMedium = c.req.query("utm_medium");
  const utmCampaign = c.req.query("utm_campaign");
  if (utmSource || utmMedium || utmCampaign) {
    const data = JSON.stringify({ utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign });
    setCookie(c, UTM_COOKIE, data, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "Lax",
    });
  }

  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.notFound();
  const live = await c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'")
    .bind(room.id)
    .first<Session>();

  let viewerCount = 0;
  if (live) {
    const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
    const res = await stub.fetch("https://do/sfu-session");
    const info = await res.json<{ viewerCount?: number }>().catch(() => ({ viewerCount: 0 }));
    viewerCount = info.viewerCount ?? 0;
  }

  return c.html(renderRoomPage({ room, live: !!live, viewerCount, appUrl: c.env.APP_URL }));
});

async function handleUnsubscribe(c: Context<{ Bindings: Env }>) {
  let token = c.req.query("token");
  if (!token && c.req.method === "POST") {
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    if (typeof body["token"] === "string") token = body["token"];
  }
  if (!token) return c.html(unsubscribePage("El link no es válido."), 400);
  const data = await verifyUnsubscribeToken(c.env.SESSION_SECRET, token);
  if (!data) return c.html(unsubscribePage("El link no es válido o ya expiró."), 400);
  await c.env.DB.prepare("DELETE FROM notify_me WHERE room_id = ? AND user_id = ?").bind(data.roomId, data.userId).run();
  return c.html(unsubscribePage("Listo, ya no te avisaremos cuando esta sala abra."));
}

function unsubscribePage(message: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Video Room</title>
<link rel="stylesheet" href="/style.css"></head>
<body class="app-shell">
  <div class="onboarding-wrap"><div class="onboarding-card">
    <div class="onboarding-emoji">🔕</div>
    <h2>${message}</h2>
    <p><a href="/" style="color:var(--green)">Volver a Video Room</a></p>
  </div></div>
</body></html>`;
}

app.get("/unsubscribe", handleUnsubscribe);
app.post("/unsubscribe", handleUnsubscribe);

app.get("/ws/room/:slug", async (c) => {
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.notFound();
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  return stub.fetch("https://do/ws", c.req.raw);
});

export default app;
