// RLR
import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import type { Env } from "../env";

export const notifications = new Hono<{ Bindings: Env }>();

notifications.get("/api/notifications", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);

  const items = await c.env.DB.prepare(
    `SELECT n.id as id, n.title as title, n.body as body, n.created_at as created_at,
            n.read_at as read_at, r.slug as room_slug, u.avatar_url as creator_avatar
     FROM notifications n
     JOIN rooms r ON r.id = n.room_id
     JOIN users u ON u.id = r.owner_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 20`
  ).bind(user.id).all();

  const unread = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL"
  ).bind(user.id).first<{ n: number }>();

  return c.json({ unread_count: unread?.n ?? 0, items: items.results });
});

notifications.post("/api/notifications/read", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  await c.env.DB.prepare(
    "UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL"
  ).bind(user.id).run();
  return c.json({ ok: true });
});
