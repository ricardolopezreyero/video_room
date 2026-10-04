// RLR
import { Hono, type Context } from "hono";
import { currentUser, sessionUid } from "../lib/current-user";
import { computeCreatorStats, computeDeepStats, sessionDetail } from "../lib/stats-core";
import type { Env } from "../env";
import type { Room, User } from "../lib/db";

export const stats = new Hono<{ Bindings: Env }>();

// Usuario y sala en un solo viaje: el id ya viene en la cookie firmada.
async function userAndRoom(c: Context<{ Bindings: Env }>): Promise<{ user: User | null; room: Room | null }> {
  const uid = await sessionUid(c);
  if (!uid) return { user: null, room: null };
  const [user, room] = await Promise.all([
    currentUser(c),
    c.env.DB.prepare("SELECT * FROM rooms WHERE owner_id = ?").bind(uid).first<Room>(),
  ]);
  return { user, room };
}

stats.get("/api/stats", async (c) => {
  const { user, room } = await userAndRoom(c);
  if (!user) return c.json({ error: "no_session" }, 401);
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
  const { user, room } = await userAndRoom(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (!room) return c.json({ has_room: false });
  const { fromTs, toTs } = parseRange(c.req.query("from"), c.req.query("to"));
  return c.json({ has_room: true, room_slug: room.slug, ...(await computeDeepStats(c.env, user, room, fromTs, toTs)) });
});

stats.get("/api/stats/session/:id", async (c) => {
  const { user, room } = await userAndRoom(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (!room) return c.json({ error: "no_room" }, 404);
  const d = await sessionDetail(c.env, room, c.req.param("id"));
  if (!d) return c.json({ error: "not_found" }, 404);
  return c.json(d);
});
