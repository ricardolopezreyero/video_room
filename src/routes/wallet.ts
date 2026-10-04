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
import { sendEmail, walletRechargeEmail, payoutSentEmail, payoutFailedEmail, bankConnectedEmail } from "../lib/email";
import { emitEvent } from "../lib/webhooks";
import { evaluateRelics } from "../lib/status";
import type { Env } from "../env";

export const wallet = new Hono<{ Bindings: Env }>();

// Centavos, en múltiplos de $20 (el costo de una hora de sala): $20,$60,$120,$240,$480,$960,$1920
const AMOUNTS = [2000, 6000, 12000, 24000, 48000, 96000, 192000];
// $10 MXN es el piso real de Stripe para pesos mexicanos — el mismo número
// que exige tanto un Transfer como un payout a banco ("el importe más bajo
// que podemos soportar con nuestros socios bancarios" en México). Bajar de
// ahí no truena la llamada, pero el dinero se quedaría atorado en el balance
// de Stripe sin llegar nunca al banco — así que este sí es el mínimo real,
// no uno inventado. Se deja bajo a propósito: todos van a querer probar que
// el retiro de verdad funciona antes de confiarle un monto grande.
const MIN_RETIRO_CENTS = 1000;

wallet.get("/api/wallet/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "no_session" }, 401);
  // Total retirado de por vida: los montos de retiro se guardan negativos en
  // el ledger, y como esa fila solo se inserta cuando el transfer de verdad
  // tuvo éxito (ver /api/wallet/retiro), este número nunca cuenta un retiro
  // que falló y se reembolsó — es la cifra que solo crece, a propósito, para
  // que el creador la vea subir cada vez que retira.
  const totalRetirado = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(-amount_cents), 0) as total FROM ledger WHERE user_id = ? AND type = 'retiro'"
  ).bind(user.id).first<{ total: number }>();
  return c.json({
    id: user.id,
    balance_cents: user.balance_cents,
    creator_balance_cents: user.creator_balance_cents,
    name: user.name,
    avatar_url: user.avatar_url,
    stripe_connect_payouts_enabled: !!user.stripe_connect_payouts_enabled,
    total_retirado_cents: totalRetirado?.total ?? 0,
    min_retiro_cents: MIN_RETIRO_CENTS,
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
      refreshUrl: `${c.env.APP_URL}/app/monedero?connect=refresh`,
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
  if (!user.stripe_connect_account_id) return c.redirect(`${c.env.APP_URL}/app/monedero?connect=error`);

  try {
    const account = await stripeGetAccount(c.env.STRIPE_SECRET_KEY, user.stripe_connect_account_id);
    await c.env.DB.prepare("UPDATE users SET stripe_connect_payouts_enabled = ? WHERE id = ?")
      .bind(account.payouts_enabled ? 1 : 0, user.id)
      .run();
    // Solo la primera vez que queda habilitado: el hito de "ya puedo cobrar".
    if (account.payouts_enabled && !user.stripe_connect_payouts_enabled) {
      try {
        await sendEmail(c.env.RESEND_API_KEY, {
          to: user.email,
          ...bankConnectedEmail({ appUrl: c.env.APP_URL, name: user.name, avatarUrl: user.avatar_url, creatorBalanceCents: user.creator_balance_cents }),
        });
      } catch (err) {
        console.error("bankConnectedEmail", err);
      }
    }
    return c.redirect(`${c.env.APP_URL}/app/monedero?connect=${account.payouts_enabled ? "ok" : "pendiente"}`);
  } catch {
    return c.redirect(`${c.env.APP_URL}/app/monedero?connect=error`);
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
      successUrl: `${c.env.APP_URL}/app/monedero?recarga=ok`,
      cancelUrl: `${c.env.APP_URL}/app/monedero?recarga=cancelada`,
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
      const credited = await creditLedger(c.env.DB, userId, amountCents, "recarga", session.id, `recarga:${session.id}`, "balance_cents");
      // credited=false significa que Stripe reintentó una entrega que ya
      // procesamos (idem_key) — sin este chequeo, un reintento de webhook
      // mandaría un segundo recibo de recarga por el mismo pago.
      if (credited) {
        const user = await c.env.DB.prepare("SELECT email, name, avatar_url, balance_cents FROM users WHERE id = ?")
          .bind(userId)
          .first<{ email: string; name: string; avatar_url: string | null; balance_cents: number }>();
        await emitEvent(c.env, userId, "wallet.recharged", {
          amount_cents: amountCents,
          balance_cents: user?.balance_cents ?? null,
          checkout_session: session.id,
        });
        if (user) {
          // Se manda esperando la respuesta (no waitUntil) y con su propio
          // try/catch: el dinero ya se acreditó pase lo que pase con el
          // correo, así que un fallo aquí nunca debe tumbar el webhook ni
          // hacer que Stripe lo reintente — pero si de verdad falla, mejor
          // enterarnos por correo que quedarnos sin ninguna pista.
          try {
            const ok = await sendEmail(c.env.RESEND_API_KEY, {
              to: user.email,
              ...walletRechargeEmail({
                appUrl: c.env.APP_URL,
                name: user.name,
                avatarUrl: user.avatar_url,
                amountCents,
                newBalanceCents: user.balance_cents,
              }),
            });
            if (!ok) throw new Error("sendEmail devolvió false (Resend rechazó el envío)");
          } catch (err) {
            c.executionCtx.waitUntil(
              sendEmail(c.env.RESEND_API_KEY, {
                to: "Ricardo@superleads.mx",
                subject: "🔴 Falló el correo de recarga de saldo",
                html: `<pre style="white-space:pre-wrap; font-family:monospace;">user_id: ${userId}\nsession: ${session.id}\namount_cents: ${amountCents}\n\n${String((err as Error)?.stack || err)}</pre>`,
                text: `user_id: ${userId} session: ${session.id} amount_cents: ${amountCents}\n${String((err as Error)?.stack || err)}`,
              }).catch(() => {})
            );
          }
        }
      }
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
  membresia: "balance_cents",
  destacado_enviado: "balance_cents",
  ganancia_entrada: "creator_balance_cents",
  propina_recibida: "creator_balance_cents",
  ganancia_membresia: "creator_balance_cents",
  destacado_recibido: "creator_balance_cents",
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
    return c.json({ error: "bajo_minimo", minimo_cents: MIN_RETIRO_CENTS }, 400);
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

    // Recibo del retiro: el correo que más confianza construye de todo el
    // producto. El dinero ya salió; esto no puede afectar la transferencia.
    try {
      const total = await c.env.DB.prepare(
        "SELECT COALESCE(SUM(-amount_cents), 0) as total, COUNT(*) as n FROM ledger WHERE user_id = ? AND type = 'retiro'"
      ).bind(user.id).first<{ total: number; n: number }>();
      await sendEmail(c.env.RESEND_API_KEY, {
        to: user.email,
        ...payoutSentEmail({
          appUrl: c.env.APP_URL,
          name: user.name,
          avatarUrl: user.avatar_url,
          amountCents: amount,
          totalWithdrawnCents: total?.total ?? amount,
          transferId: transfer.id,
          isFirst: (total?.n ?? 1) === 1,
        }),
      });
    } catch (err) {
      console.error("payoutSentEmail", err);
    }
    await emitEvent(c.env, user.id, "payout.sent", { amount_cents: amount, transfer_id: transfer.id });
    const newRelics = await evaluateRelics(c.env, user.id);
    return c.json({ ok: true, monto_cents: amount, new_relics: newRelics.map(({ code, name, icon, how }) => ({ code, name, icon, how })) });
  } catch {
    // La transferencia real falló después de reservar el balance — se
    // regresa el dinero para que nunca se pierda el rastro, y el creador
    // puede volver a intentar el retiro cuando quiera.
    await creditLedger(c.env.DB, user.id, amount, "retiro_fallido_reembolso", null, `retiro_reembolso:${retiroId}`, "creator_balance_cents");
    try {
      await sendEmail(c.env.RESEND_API_KEY, {
        to: user.email,
        ...payoutFailedEmail({ appUrl: c.env.APP_URL, name: user.name, avatarUrl: user.avatar_url, amountCents: amount }),
      });
    } catch (err) {
      console.error("payoutFailedEmail", err);
    }
    return c.json({ error: "transferencia_fallida" }, 502);
  }
});
