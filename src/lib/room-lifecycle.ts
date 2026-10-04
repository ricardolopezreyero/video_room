import type { Env } from "../env";
import type { Room, Session } from "./db";
import { sendEmail, streamSummaryEmail } from "./email";
import { emitEvent } from "./webhooks";
import { evaluateRelics, statusFor } from "./status";

// Cierra una sesión en vivo: la marca 'ended', borra sus comentarios (son
// eventos fugaces, no sobreviven al cierre de la sala), avisa al Durable
// Object para que reparta el resumen y desconecte a quien siga viendo, y le
// manda al creador un correo con el resumen — así siempre se entera de cómo
// le fue sin tener que entrar a revisar sus estadísticas por su cuenta.
// La usan tanto el botón "Terminar" del creador como la limpieza automática
// de salas abandonadas (ver scheduled() en src/index.ts).
export async function endLiveSession(
  env: Env,
  room: Room,
  session: Session,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<{ earned_cents: number; peak_viewers: number; hearts: number; new_relics?: { code: string; name: string; icon: string }[] }> {
  const endedAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?").bind(endedAt, session.id).run();

  const deleteComments = env.DB.prepare("DELETE FROM comments WHERE session_id = ?").bind(session.id).run();
  if (waitUntil) waitUntil(deleteComments);
  else await deleteComments;

  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.id));
  const res = await stub.fetch("https://do/stop", { method: "POST" });
  const summary = await res.json<{ earned_cents: number; peak_viewers: number; hearts: number }>();

  // El resumen queda en la sesión: alimenta reliquias (Sala llena, Maratón…)
  // y la API de sesiones. Luego se revisa qué hitos se ganaron con esta
  // transmisión, para enseñarlos en el correo y en pantalla.
  await env.DB.prepare("UPDATE sessions SET peak_viewers = ?, earned_cents = ?, hearts = ? WHERE id = ?")
    .bind(summary.peak_viewers, summary.earned_cents, summary.hearts, session.id).run().catch(() => {});
  const newRelics = await evaluateRelics(env, room.owner_id, { sessionId: session.id });
  const status = await statusFor(env, room.owner_id).catch(() => null);

  // Se espera a que termine de mandarse (no waitUntil) — un correo que se
  // manda "en segundo plano" y nunca comprobamos que salió es un correo que
  // en la práctica no confiamos en que llegue.
  try {
    const owner = await env.DB.prepare("SELECT email, name, avatar_url FROM users WHERE id = ?")
      .bind(room.owner_id)
      .first<{ email: string; name: string; avatar_url: string | null }>();
    if (owner) {
      const durationMinutes = Math.max(0, Math.round((endedAt - session.started_at) / 60));
      const { subject, html, text } = streamSummaryEmail({
        appUrl: env.APP_URL,
        name: owner.name,
        avatarUrl: owner.avatar_url,
        roomTitle: room.title,
        durationMinutes,
        earnedCents: summary.earned_cents,
        peakViewers: summary.peak_viewers,
        hearts: summary.hearts,
        newRelics: newRelics.map((r) => ({ icon: r.icon, name: r.name, how: r.how })),
        rankLine: status
          ? `${status.creator.rank.name} · ${status.creator.hours} h en vivo${status.creator.next ? ` · ${Math.max(0, Math.ceil(status.creator.next.hours - status.creator.hours))} h para ${status.creator.next.name}` : ""}`
          : undefined,
      });
      await sendEmail(env.RESEND_API_KEY, { to: owner.email, subject, html, text });
    }
  } catch (err) {
    console.error(err);
  }

  await emitEvent(env, room.owner_id, "room.ended", {
    session_id: session.id,
    room: { slug: room.slug, url: `${env.APP_URL}/${room.slug}` },
    started_at: session.started_at,
    ended_at: endedAt,
    duration_seconds: Math.max(0, endedAt - session.started_at),
    earned_cents: summary.earned_cents,
    peak_viewers: summary.peak_viewers,
    hearts: summary.hearts,
  });

  return { ...summary, new_relics: newRelics.map(({ code, name, icon }) => ({ code, name, icon })) };
}
