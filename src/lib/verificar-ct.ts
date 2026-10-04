// RLR · Verificar un pase del Login de CapitalTorreon (login.capitaltorreon.com)
// sin llamar al login: la llave pública se trae una vez por hora y el pase
// (ES256) se comprueba aquí. Mismo código que usa Mina, en TypeScript.
const EMISOR = "https://login.capitaltorreon.com";

export interface PaseCT {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  aud: string;
  iat: number;
  exp: number;
  iss: string;
}

let jwksCache: { keys: JsonWebKey[] } | null = null;
let jwksT = 0;
async function jwks(): Promise<{ keys: (JsonWebKey & { kid?: string })[] }> {
  if (!jwksCache || Date.now() - jwksT > 3600000) {
    jwksCache = await (await fetch(`${EMISOR}/.well-known/jwks.json`)).json();
    jwksT = Date.now();
  }
  return jwksCache as { keys: (JsonWebKey & { kid?: string })[] };
}

const de = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Devuelve el cuerpo del pase si es válido, vigente y emitido para `aud`; null si no. */
export async function verificarPase(pase: unknown, aud: string | string[]): Promise<PaseCT | null> {
  const auds = Array.isArray(aud) ? aud : [aud];
  if (typeof pase !== "string") return null;
  const [h, p, s] = pase.split(".");
  if (!h || !p || !s) return null;
  let cab: { alg?: string; kid?: string }, cuerpo: PaseCT;
  try {
    cab = JSON.parse(new TextDecoder().decode(de(h)));
    cuerpo = JSON.parse(new TextDecoder().decode(de(p)));
  } catch {
    return null;
  }
  if (cab.alg !== "ES256" || cuerpo.iss !== EMISOR || !(cuerpo.exp > Date.now() / 1000) || !auds.includes(cuerpo.aud)) return null;
  if (!/^\d{1,40}$/.test(String(cuerpo.sub || "")) || !/^[^@\s]+@[^@\s]+$/.test(String(cuerpo.email || ""))) return null;
  let jwk = (await jwks()).keys.find((k) => k.kid === cab.kid);
  if (!jwk) {
    // Llave nueva en la casa: se vuelve a pedir una vez.
    jwksCache = null;
    jwk = (await jwks()).keys.find((k) => k.kid === cab.kid);
    if (!jwk) return null;
  }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, de(s), new TextEncoder().encode(`${h}.${p}`));
  return ok ? cuerpo : null;
}
