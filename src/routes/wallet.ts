import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { creditLedger, newId } from "../lib/db";
import { stripeCreateCheckoutSession, verifyStripeSignature } from "../lib/stripe";
import type { Env } from "../env";

export const wallet = new Hono<{ Bindings: Env }>();

// Centavos, en múltiplos de $20 (el costo de una hora de sala): $20,$60,$120,$240,$480,$960,$1920
const AMOUNTS = [2000, 6000, 12000, 24000, 48000, 96000, 192000];
const MIN_RETIRO_CENTS = 20000;

wallet.get("/api/wallet/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  return c.json({
    id: user.id,
    balance_cents: user.balance_cents,
    creator_balance_cents: user.creator_balance_cents,
    name: user.name,
    avatar_url: user.avatar_url,
  });
});

wallet.post("/api/wallet/checkout", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  const { amount_cents } = await c.req.json<{ amount_cents: number }>().catch(() => ({ amount_cents: 0 }));
  if (!AMOUNTS.includes(amount_cents)) return c.json({ error: "monto_invalido" }, 400);

  try {
    const session = await stripeCreateCheckoutSession(c.env.STRIPE_SECRET_KEY, {
      amountCents: amount_cents,
      userId: user.id,
      successUrl: `${c.env.APP_URL}/monedero?recarga=ok`,
      cancelUrl: `${c.env.APP_URL}/monedero?recarga=cancelada`,
    });
    return c.json({ url: session.url });
  } catch {
    return c.json({ error: "stripe_no_disponible" }, 502);
  }
});

wallet.post("/webhook/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  const payload = await c.req.text();
  if (!sig || !(await verifyStripeSignature(payload, sig, c.env.STRIPE_WEBHOOK_SECRET))) {
    return c.text("firma inválida", 400);
  }
  let event: { type: string; data: { object: any } };
  try {
    event = JSON.parse(payload);
  } catch {
    return c.text("payload inválido", 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const amountCents = Number(session.metadata?.amount_cents ?? 0);
    if (userId && amountCents > 0) {
      await creditLedger(c.env.DB, userId, amountCents, "recarga", session.id, `recarga:${session.id}`, "balance_cents");
    }
  }
  return c.json({ received: true });
});

wallet.post("/api/wallet/retiro", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (user.creator_balance_cents < MIN_RETIRO_CENTS) {
    return c.json({ error: "minimo_200" }, 400);
  }
  const amount = user.creator_balance_cents;

  // Update condicional atómico: si otra solicitud ya retiró (o el balance cambió)
  // entre la lectura y este punto, changes será 0 y no se duplica el retiro.
  const result = await c.env.DB.prepare(
    "UPDATE users SET creator_balance_cents = 0 WHERE id = ? AND creator_balance_cents = ?"
  ).bind(user.id, amount).run();

  if (result.meta.changes === 0) {
    return c.json({ error: "no_procesado" }, 409);
  }

  // MVP: registra la solicitud de retiro en el ledger; el pago vía Stripe Connect/transfer se conecta en la siguiente iteración.
  await c.env.DB.prepare(
    "INSERT INTO ledger (id, user_id, amount_cents, type, ref_id, idem_key) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(newId("ldg"), user.id, -amount, "retiro", null, newId("retiro")).run();

  return c.json({ ok: true, monto_cents: amount });
});
