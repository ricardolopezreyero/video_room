// RLR
// Webhooks salientes: cuando pasa algo en la sala de un usuario, se lo
// contamos a las URLs que registró, firmado igual que lo hace Stripe
// (X-VideoRoom-Signature: t=<unix>,v1=<hmac_sha256_hex(secret, t + "." + body)>).
// Se espera la respuesta (timeout corto) para no depender de waitUntil, y un
// fallo solo se anota en el endpoint: nunca tumba la acción que lo originó.
import type { Env } from "../env";

export const WEBHOOK_EVENTS = [
  "room.live",
  "room.ended",
  "viewer.entered",
  "tip.received",
  "follower.added",
  "wallet.recharged",
  "payout.sent",
  "ping",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookEndpoint {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string;
  active: number;
  created_at: number;
  last_delivered_at: number | null;
  last_status: number | null;
  last_error: string | null;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function subscribed(endpoint: WebhookEndpoint, event: WebhookEvent): boolean {
  if (event === "ping") return true;
  const list = endpoint.events.split(",").map((s) => s.trim());
  return list.includes("*") || list.includes(event);
}

export async function deliverToEndpoint(
  env: Env,
  endpoint: WebhookEndpoint,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const t = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ id: `evt_${t}_${Math.random().toString(36).slice(2, 10)}`, type: event, created_at: t, data });
  const v1 = await hmacHex(endpoint.secret, `${t}.${body}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VideoRoom-Webhooks/1.0 (+video.capitaltorreon.com/app/api)",
        "X-VideoRoom-Event": event,
        "X-VideoRoom-Signature": `t=${t},v1=${v1}`,
      },
      body,
      signal: controller.signal,
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error && err.name === "AbortError" ? "timeout (6s)" : String((err as Error)?.message || err);
  } finally {
    clearTimeout(timer);
  }
  try {
    await env.DB.prepare(
      "UPDATE webhook_endpoints SET last_delivered_at = unixepoch(), last_status = ?, last_error = ? WHERE id = ?"
    ).bind(status, error, endpoint.id).run();
  } catch {
    /* la bitácora no debe tumbar nada */
  }
  return { ok: !error, status, error };
}

/** Avisa a todos los endpoints activos del usuario suscritos a `event`. Nunca lanza. */
export async function emitEvent(env: Env, userId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM webhook_endpoints WHERE user_id = ? AND active = 1"
    ).bind(userId).all<WebhookEndpoint>();
    const targets = results.filter((e) => subscribed(e, event));
    if (targets.length === 0) return;
    await Promise.all(targets.map((e) => deliverToEndpoint(env, e, event, data)));
  } catch (err) {
    console.error("emitEvent", event, err);
  }
}
