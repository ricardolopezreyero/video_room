// RLR
import type { Context } from "hono";
import type { Env } from "../env";

/** Deja correr una promesa después de responder (waitUntil). En las pruebas,
 *  donde no hay ExecutionContext, simplemente la deja correr sin esperarla:
 *  nunca convierte una tarea de fondo en un error de la respuesta. */
export function afterResponse(c: Context<{ Bindings: Env }>, p: Promise<unknown>): void {
  const silenciosa = p.catch((err) => console.error("segundo plano", err));
  try {
    c.executionCtx.waitUntil(silenciosa);
  } catch {
    // sin ExecutionContext (vitest / app.request): ya quedó corriendo
  }
}
