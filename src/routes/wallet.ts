import { Hono } from "hono";
import { currentUser } from "../lib/current-user";
import { creditLedger, newId } from "../lib/db";
import {
  stripeCreateCheckoutSession,
  verifyStripeSignature,
  stripeCreateConnectAccount,
  stripeCreateAccountLink,
  stripeGetAccount,
  stripeCreateTransfer,
  StripeApiError,
} from "../lib/stripe";
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
    stripe_connect_payouts_enabled: !!user.stripe_connect_payouts_enabled,
  });
});

// Crea (si hace falta) la cuenta Express de Stripe Connect del creador y
// devuelve el link de onboarding alojado por Stripe — ahí es donde suben su
// identidad y datos bancarios, nunca los vemos nosotros.
wallet.post("/api/wallet/connect/start", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);

  try {
    let accountId = user.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripeCreateConnectAccount(c.env.STRIPE_SECRET_KEY, user.email);
      accountId = account.id;
      await c.env.DB.prepare("UPDATE users SET stripe_connect_account_id = ? WHERE id = ?").bind(accountId, user.id).run();
    }
    const link = await stripeCreateAccountLink(c.env.STRIPE_SECRET_KEY, {
      accountId,
      refreshUrl: `${c.env.APP_URL}/monedero?connect=refresh`,
      returnUrl: `${c.env.APP_URL}/api/wallet/connect/return`,
    });
    return c.json({ url: link.url });
  } catch (err) {
    if (err instanceof StripeApiError && err.isConnectNotEnabled) {
      return c.json({ error: "connect_no_disponible" }, 502);
    }
    return c.json({ error: "stripe_no_disponible" }, 502);
  }
});

// A donde Stripe manda de vuelta al creador tras el onboarding alojado.
wallet.get("/api/wallet/connect/return", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.redirect(`${c.env.APP_URL}/login`);
  if (!user.stripe_connect_account_id) return c.redirect(`${c.env.APP_URL}/monedero?connect=error`);

  try {
    const account = await stripeGetAccount(c.env.STRIPE_SECRET_KEY, user.stripe_connect_account_id);
    await c.env.DB.prepare("UPDATE users SET stripe_connect_payouts_enabled = ? WHERE id = ?")
      .bind(account.payouts_enabled ? 1 : 0, user.id)
      .run();
    return c.redirect(`${c.env.APP_URL}/monedero?connect=${account.payouts_enabled ? "ok" : "pendiente"}`);
  } catch {
    return c.redirect(`${c.env.APP_URL}/monedero?connect=error`);
  }
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

// De qué balance sale/entra cada tipo de movimiento — todo lo que toca el
// saldo de un usuario pasa por creditLedger() o un insert directo (retiro),
// así que sumar amount_cents en orden cronológico reconstruye el saldo real.
const BALANCE_FIELD_BY_TYPE: Record<string, "balance_cents" | "creator_balance_cents"> = {
  recarga: "balance_cents",
  entrada: "balance_cents",
  renovacion: "balance_cents",
  propina_enviada: "balance_cents",
  ganancia_entrada: "creator_balance_cents",
  propina_recibida: "creator_balance_cents",
  retiro: "creator_balance_cents",
  retiro_fallido_reembolso: "creator_balance_cents",
};

wallet.get("/api/wallet/transactions", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);

  const { results } = await c.env.DB.prepare(
    "SELECT id, type, amount_cents, created_at FROM ledger WHERE user_id = ? ORDER BY created_at ASC"
  ).bind(user.id).all<{ id: string; type: string; amount_cents: number; created_at: number }>();

  const running = { balance_cents: 0, creator_balance_cents: 0 };
  const transactions = results.map((row) => {
    const balanceField = BALANCE_FIELD_BY_TYPE[row.type] ?? "balance_cents";
    running[balanceField] += row.amount_cents;
    return { ...row, balance_field: balanceField, running_balance_cents: running[balanceField] };
  });
  transactions.reverse(); // más reciente primero

  return c.json({ transactions });
});

wallet.post("/api/wallet/retiro", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  if (!user.stripe_connect_account_id || !user.stripe_connect_payouts_enabled) {
    return c.json({ error: "cuenta_no_conectada" }, 400);
  }
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

  const retiroId = newId("retiro");
  try {
    const transfer = await stripeCreateTransfer(c.env.STRIPE_SECRET_KEY, {
      amountCents: amount,
      destinationAccountId: user.stripe_connect_account_id,
      idempotencyKey: retiroId,
    });
    await c.env.DB.prepare(
      "INSERT INTO ledger (id, user_id, amount_cents, type, ref_id, idem_key) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId("ldg"), user.id, -amount, "retiro", transfer.id, retiroId).run();
    return c.json({ ok: true, monto_cents: amount });
  } catch {
    // La transferencia real falló después de reservar el balance — se
    // regresa el dinero para que nunca se pierda el rastro, y el creador
    // puede volver a intentar el retiro cuando quiera.
    await creditLedger(c.env.DB, user.id, amount, "retiro_fallido_reembolso", null, `retiro_reembolso:${retiroId}`, "creator_balance_cents");
    return c.json({ error: "transferencia_fallida" }, 502);
  }
});
