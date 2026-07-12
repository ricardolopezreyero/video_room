import type { Env } from "../env";
import type { Room, Session } from "./db";
import { sendEmail, streamSummaryEmail } from "./email";

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
): Promise<{ earned_cents: number; peak_viewers: number; hearts: number }> {
  const endedAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?").bind(endedAt, session.id).run();

  const deleteComments = env.DB.prepare("DELETE FROM comments WHERE session_id = ?").bind(session.id).run();
  if (waitUntil) waitUntil(deleteComments);
  else await deleteComments;

  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.id));
  const res = await stub.fetch("https://do/stop", { method: "POST" });
  const summary = await res.json<{ earned_cents: number; peak_viewers: number; hearts: number }>();

  const sendSummary = (async () => {
    const owner = await env.DB.prepare("SELECT email, name FROM users WHERE id = ?")
      .bind(room.owner_id)
      .first<{ email: string; name: string }>();
    if (!owner) return;
    const durationMinutes = Math.max(0, Math.round((endedAt - session.started_at) / 60));
    const { subject, html, text } = streamSummaryEmail({
      appUrl: env.APP_URL,
      name: owner.name,
      roomTitle: room.title,
      durationMinutes,
      earnedCents: summary.earned_cents,
      peakViewers: summary.peak_viewers,
      hearts: summary.hearts,
    });
    await sendEmail(env.RESEND_API_KEY, { to: owner.email, subject, html, text });
  })();
  if (waitUntil) waitUntil(sendSummary);
  else await sendSummary;

  return summary;
}
