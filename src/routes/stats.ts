// RLR
import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { computeCreatorStats, computeDeepStats, sessionDetail } from "../lib/stats-core";
import type { Env } from "../env";
import type { Room } from "../lib/db";

export const stats = new Hono<{ Bindings: Env }>();

stats.get("/api/stats", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);

  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(user.id).first<Room>();
  if (!room) return c.json({ has_room: false });

  return c.json(await computeCreatorStats(c.env, user, room, c.req.query("range") ?? "30d"));
});

/** Rango de fechas libre: ?from=YYYY-MM-DD&to=YYYY-MM-DD (CDMX). Por defecto los últimos 30 días. */
export function parseRange(from?: string, to?: string): { fromTs: number; toTs: number } {
  const CDMX = 6 * 3600;
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 1000;
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const now = Math.floor(Date.now() / 1000);
  const toTs = ok(to) ? day(to!) + CDMX + 86399 : now;
  const fromTs = ok(from) ? day(from!) + CDMX : toTs - 30 * 86400;
  return { fromTs: Math.min(fromTs, toTs), toTs };
}

stats.get("/api/stats/deep", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(user.id).first<Room>();
  if (!room) return c.json({ has_room: false });
  const { fromTs, toTs } = parseRange(c.req.query("from"), c.req.query("to"));
  return c.json({ has_room: true, room_slug: room.slug, ...(await computeDeepStats(c.env, user, room, fromTs, toTs)) });
});

stats.get("/api/stats/session/:id", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(user.id).first<Room>();
  if (!room) return c.json({ error: "no_room" }, 404);
  const d = await sessionDetail(c.env, room, c.req.param("id"));
  if (!d) return c.json({ error: "not_found" }, 404);
  return c.json(d);
});
