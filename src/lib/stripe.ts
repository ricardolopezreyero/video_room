const STRIPE_API = "https://api.stripe.com/v1";

// Envuelve errores de la API de Stripe para que quien llame pueda distinguir
// "Connect no está habilitado en la cuenta de la plataforma" (algo que solo
// Ricardo puede resolver en su Dashboard de Stripe) de cualquier otro error.
export class StripeApiError extends Error {
  raw: string;
  constructor(raw: string) {
    super(`Stripe error: ${raw}`);
    this.raw = raw;
  }
  get isConnectNotEnabled(): boolean {
    return /not.*enabled.*connect|connect.*not.*enabled|signed up for Connect/i.test(this.raw);
  }
}

async function stripeRequest(
  secretKey: string,
  method: "GET" | "POST",
  path: string,
  body?: URLSearchParams,
  idempotencyKey?: string
): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body });
  if (!res.ok) throw new StripeApiError(await res.text());
  return res.json();
}

export async function stripeCreateCheckoutSession(
  secretKey: string,
  params: { amountCents: number; userId: string; successUrl: string; cancelUrl: string }
): Promise<{ url: string; id: string }> {
  const body = new URLSearchParams({
    mode: "payment",
    // "card" ya incluye Apple Pay / Google Pay como wallets automáticos en Checkout
    // (se muestran solos si el navegador/dispositivo los soporta, sin config extra).
    // Se deja fijo a "card" a propósito para NO habilitar por accidente métodos
    // asíncronos (OXXO, SPEI, etc.) que necesitarían manejar
    // checkout.session.async_payment_succeeded aparte — hoy solo escuchamos
    // checkout.session.completed, que para "card" siempre es pago inmediato.
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "mxn",
    "line_items[0][price_data][product_data][name]": "Recarga de saldo Video Room",
    "line_items[0][price_data][unit_amount]": String(params.amountCents),
    "line_items[0][quantity]": "1",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "metadata[user_id]": params.userId,
    "metadata[amount_cents]": String(params.amountCents),
    "metadata[kind]": "recarga",
  });
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe error: ${await res.text()}`);
  return res.json();
}

// Cuenta Express de Stripe Connect: Stripe se encarga del formulario de alta
// (identidad + datos bancarios) y de mandar los payouts al banco del creador
// según su propio calendario — nosotros solo guardamos el id de la cuenta.
export async function stripeCreateConnectAccount(secretKey: string, email: string): Promise<{ id: string }> {
  return stripeRequest(
    secretKey,
    "POST",
    "/accounts",
    new URLSearchParams({
      type: "express",
      email,
      "capabilities[transfers][requested]": "true",
      country: "MX",
    })
  );
}

export async function stripeCreateAccountLink(
  secretKey: string,
  params: { accountId: string; refreshUrl: string; returnUrl: string }
): Promise<{ url: string }> {
  return stripeRequest(
    secretKey,
    "POST",
    "/account_links",
    new URLSearchParams({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: "account_onboarding",
    })
  );
}

export async function stripeGetAccount(secretKey: string, accountId: string): Promise<{ payouts_enabled: boolean }> {
  return stripeRequest(secretKey, "GET", `/accounts/${accountId}`);
}

// Mueve dinero real del balance de la plataforma a la cuenta conectada del
// creador. idempotencyKey evita una transferencia doble si la petición se
// reintenta después de que Stripe ya la procesó pero la respuesta se perdió.
export async function stripeCreateTransfer(
  secretKey: string,
  params: { amountCents: number; destinationAccountId: string; idempotencyKey: string }
): Promise<{ id: string }> {
  return stripeRequest(
    secretKey,
    "POST",
    "/transfers",
    new URLSearchParams({
      amount: String(params.amountCents),
      currency: "mxn",
      destination: params.destinationAccountId,
    }),
    params.idempotencyKey
  );
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;
  // Rechaza payloads viejos reenviados (ataque de repetición) aunque la firma sea válida.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return expected === v1;
}
