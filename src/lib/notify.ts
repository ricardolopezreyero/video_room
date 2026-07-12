// RLR
import { newId, type Room } from "./db";
import { sendEmail, liveNotificationEmail, startingSoonEmail, creatorNotifyConfirmationEmail } from "./email";
import { signUnsubscribeToken } from "./unsubscribe";
import type { Env } from "../env";

interface Follower {
  id: string;
  email: string;
}

async function getFollowers(env: Env, roomId: string): Promise<Follower[]> {
  const res = await env.DB.prepare(
    "SELECT u.id as id, u.email as email FROM notify_me n JOIN users u ON u.id = n.user_id WHERE n.room_id = ?"
  ).bind(roomId).all<Follower>();
  return res.results;
}

// Se llama vía waitUntil desde /api/rooms/:slug/start — no debe bloquear la
// respuesta al creador. Avisa por correo y deja una notificación in-app a
// cada persona que pidió "avísame cuando abra" para esta sala.
export async function notifyRoomLive(
  env: Env,
  room: Room,
  sessionId: string,
  creatorName: string,
  creatorAvatar: string | null,
  creatorEmail: string
): Promise<void> {
  const followers = await getFollowers(env, room.id);
  const roomUrl = `${env.APP_URL}/${room.slug}`;

  if (followers.length > 0) {
    const title = `🔴 ${creatorName} ya está en vivo`;
    const body = `Entra a ${room.title} antes de que se acabe.`;

    const inserts = followers.map((f) =>
      env.DB.prepare(
        "INSERT INTO notifications (id, user_id, room_id, session_id, title, body) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(newId("ntf"), f.id, room.id, sessionId, title, body)
    );
    await env.DB.batch(inserts);

    await Promise.all(
      followers.map(async (f) => {
        const unsubscribeUrl = `${env.APP_URL}/unsubscribe?token=${await signUnsubscribeToken(env.SESSION_SECRET, f.id, room.id)}`;
        const { subject, html, text } = liveNotificationEmail({
          appUrl: env.APP_URL,
          creatorName,
          creatorAvatar,
          roomTitle: room.title,
          roomUrl,
          unsubscribeUrl,
        });
        return sendEmail(env.RESEND_API_KEY, { to: f.email, subject, html, text, unsubscribeUrl });
      })
    );
  }

  // Copia de confirmación para el creador — siempre, tenga o no seguidores,
  // así comprueba con sus propios ojos que el envío sí salió.
  const confirmation = creatorNotifyConfirmationEmail({
    appUrl: env.APP_URL,
    creatorName,
    creatorAvatar,
    roomTitle: room.title,
    roomUrl,
    followerCount: followers.length,
    kind: "live",
  });
  await sendEmail(env.RESEND_API_KEY, { to: creatorEmail, ...confirmation });
}

// Se llama desde /api/rooms/:slug/notify-starting cuando el creador avisa
// manualmente "empiezo en X minutos". Devuelve cuántas personas se avisaron.
export async function notifyRoomStartingSoon(
  env: Env,
  room: Room,
  minutes: number,
  creatorName: string,
  creatorAvatar: string | null,
  creatorEmail: string
): Promise<number> {
  const followers = await getFollowers(env, room.id);
  const roomUrl = `${env.APP_URL}/${room.slug}`;

  if (followers.length > 0) {
    await Promise.all(
      followers.map(async (f) => {
        const unsubscribeUrl = `${env.APP_URL}/unsubscribe?token=${await signUnsubscribeToken(env.SESSION_SECRET, f.id, room.id)}`;
        const { subject, html, text } = startingSoonEmail({
          appUrl: env.APP_URL,
          creatorName,
          creatorAvatar,
          roomTitle: room.title,
          roomUrl,
          minutes,
          unsubscribeUrl,
        });
        return sendEmail(env.RESEND_API_KEY, { to: f.email, subject, html, text, unsubscribeUrl });
      })
    );
  }

  // Copia de confirmación para el creador — siempre, tenga o no seguidores,
  // así comprueba con sus propios ojos que el envío sí salió.
  const confirmation = creatorNotifyConfirmationEmail({
    appUrl: env.APP_URL,
    creatorName,
    creatorAvatar,
    roomTitle: room.title,
    roomUrl,
    followerCount: followers.length,
    kind: "starting_soon",
    minutes,
  });
  await sendEmail(env.RESEND_API_KEY, { to: creatorEmail, ...confirmation });

  return followers.length;
}
