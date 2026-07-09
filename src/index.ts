// RLR
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { UTM_COOKIE } from "./lib/utm";
import type { Env } from "./env";
import { auth } from "./routes/auth";
import { wallet } from "./routes/wallet";
import { rooms } from "./routes/rooms";
import { calls } from "./routes/calls";
import { stats } from "./routes/stats";
import { renderRoomPage } from "./lib/room-page";
import type { Room, Session } from "./lib/db";

export { RoomDurableObject } from "./durable/room";

const _RLR = "Ricardo López Reyero";
const _k = "EYE", _rev = 181218; // RLR build marker

const app = new Hono<{ Bindings: Env }>();
void _RLR;
void _k;
void _rev;

app.route("/", auth);
app.route("/", wallet);
app.route("/", rooms);
app.route("/", calls);
app.route("/", stats);

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
    void res; // solo para asegurar el DO existe/arrancado
  }

  return c.html(renderRoomPage({ room, live: !!live, viewerCount, appUrl: c.env.APP_URL }));
});

app.get("/ws/room/:slug", async (c) => {
  const slug = c.req.param("slug");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>();
  if (!room) return c.notFound();
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  return stub.fetch("https://do/ws", c.req.raw);
});

export default app;
