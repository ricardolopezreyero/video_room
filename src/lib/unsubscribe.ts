// RLR
// Token firmado y sin estado para el link de "dejar de seguir" en los correos:
// no requiere que la persona haya iniciado sesión para funcionar (y para que
// Gmail/Outlook puedan hacerlo automático vía List-Unsubscribe-Post).
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signUnsubscribeToken(secret: string, userId: string, roomId: string): Promise<string> {
  const payload = btoa(JSON.stringify({ u: userId, r: roomId })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyUnsubscribeToken(
  secret: string,
  token: string
): Promise<{ userId: string; roomId: string } | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { u: string; r: string };
    if (!data.u || !data.r) return null;
    return { userId: data.u, roomId: data.r };
  } catch {
    return null;
  }
}
