// RLR
import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { computeCreatorStats } from "../lib/stats-core";
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
