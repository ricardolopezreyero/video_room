// RLR
import { newId, type Room } from "./db";
import { sendEmail, liveNotificationEmail } from "./email";
import type { Env } from "../env";

// Se llama vía waitUntil desde /api/rooms/:slug/start — no debe bloquear la
// respuesta al creador. Avisa por correo y deja una notificación in-app a
// cada persona que pidió "avísame cuando abra" para esta sala.
export async function notifyRoomLive(env: Env, room: Room, sessionId: string, creatorName: string): Promise<void> {
  const followers = await env.DB.prepare(
    "SELECT u.id as id, u.email as email FROM notify_me n JOIN users u ON u.id = n.user_id WHERE n.room_id = ?"
  ).bind(room.id).all<{ id: string; email: string }>();

  if (followers.results.length === 0) return;

  const roomUrl = `${env.APP_URL}/r/${room.slug}`;
  const { subject, html, text } = liveNotificationEmail({ creatorName, roomTitle: room.title, roomUrl });
  const title = `🔴 ${creatorName} ya está en vivo`;
  const body = `Entra a ${room.title} antes de que se acabe.`;

  const inserts = followers.results.map((f) =>
    env.DB.prepare(
      "INSERT INTO notifications (id, user_id, room_id, session_id, title, body) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId("ntf"), f.id, room.id, sessionId, title, body)
  );
  await env.DB.batch(inserts);

  await Promise.all(
    followers.results.map((f) => sendEmail(env.RESEND_API_KEY, { to: f.email, subject, html, text }))
  );
}
