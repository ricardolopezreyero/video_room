const STRIPE_API = "https://api.stripe.com/v1";

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
