import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { creditLedger } from "../lib/db";
import { stripeCreateCheckoutSession, verifyStripeSignature } from "../lib/stripe";
import type { Env } from "../env";

export const wallet = new Hono<{ Bindings: Env }>();

const AMOUNTS = [2000, 5000, 10000, 50000, 100000, 200000]; // centavos: $20,$50,$100,$500,$1000,$2000

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
  const { amount_cents } = await c.req.json<{ amount_cents: number }>();
  if (!AMOUNTS.includes(amount_cents)) return c.json({ error: "monto_invalido" }, 400);

  const session = await stripeCreateCheckoutSession(c.env.STRIPE_SECRET_KEY, {
    amountCents: amount_cents,
    userId: user.id,
    successUrl: `${c.env.APP_URL}/monedero?recarga=ok`,
    cancelUrl: `${c.env.APP_URL}/monedero?recarga=cancelada`,
  });
  return c.json({ url: session.url });
});

wallet.post("/webhook/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  const payload = await c.req.text();
  if (!sig || !(await verifyStripeSignature(payload, sig, c.env.STRIPE_WEBHOOK_SECRET))) {
    return c.text("firma inválida", 400);
  }
  const event = JSON.parse(payload) as { type: string; data: { object: any } };

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
  if (user.creator_balance_cents < 20000) {
    return c.json({ error: "minimo_200" }, 400);
  }
  // MVP: registra la solicitud de retiro en el ledger; el pago vía Stripe Connect/transfer se conecta en la siguiente iteración.
  const idem = `retiro:${user.id}:${Date.now()}`;
  await creditLedger(c.env.DB, user.id, -user.creator_balance_cents, "retiro", null, idem, "creator_balance_cents");
  return c.json({ ok: true, monto_cents: user.creator_balance_cents });
});
