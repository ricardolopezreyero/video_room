const STRIPE_API = "https://api.stripe.com/v1";

export async function stripeCreateCheckoutSession(
  secretKey: string,
  params: { amountCents: number; userId: string; successUrl: string; cancelUrl: string }
): Promise<{ url: string; id: string }> {
  const body = new URLSearchParams({
    mode: "payment",
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

export async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return expected === v1;
}
