import type { Env } from "../env";
import type { Room, Session } from "./db";

// Cierra una sesión en vivo: la marca 'ended', borra sus comentarios (son
// eventos fugaces, no sobreviven al cierre de la sala) y avisa al Durable
// Object para que reparta el resumen y desconecte a quien siga viendo.
// La usan tanto el botón "Terminar" del creador como la limpieza automática
// de salas abandonadas (ver scheduled() en src/index.ts).
export async function endLiveSession(
  env: Env,
  room: Room,
  session: Session,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<{ earned_cents: number; peak_viewers: number; hearts: number }> {
  await env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = unixepoch() WHERE id = ?").bind(session.id).run();

  const deleteComments = env.DB.prepare("DELETE FROM comments WHERE session_id = ?").bind(session.id).run();
  if (waitUntil) waitUntil(deleteComments);
  else await deleteComments;

  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.id));
  const summary = await stub.fetch("https://do/stop", { method: "POST" });
  return summary.json();
}
