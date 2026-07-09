export interface SessionData {
  uid: string;
  exp: number;
}

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

export async function signSession(secret: string, data: SessionData): Promise<string> {
  const payload = btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySession(secret: string, token: string): Promise<SessionData | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as SessionData;
    if (data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "vr_session";

// 400 días: el máximo que Chrome/Safari permiten para la vida de una cookie.
// La sesión se renueva en cada visita (ver current-user.ts), así que en la
// práctica no expira mientras la persona use la app al menos una vez en ese lapso.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
