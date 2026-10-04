import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../lib/session";
import { newId, type User } from "../lib/db";
import { nextAvailableSlug } from "../lib/slugs";
import { readUtmCookie } from "../lib/utm";
import { sendEmail, welcomeEmail } from "../lib/email";
import type { Env } from "../env";
import { verificarPase } from "../lib/verificar-ct";
import { ponerSesion, quitarSesion } from "../lib/current-user";

export const auth = new Hono<{ Bindings: Env }>();

// El login es el de la casa: login.capitaltorreon.com (un solo Google para
// todos los servicios de CapitalTorreon). /login manda allá y la casa vuelve
// a esta misma página con el pase; el puente (puente-login.js) lo cambia por
// la sesión de Video Room en POST /auth/ct.
const LOGIN_CASA = "https://login.capitaltorreon.com";
function origenDe(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin;
}

auth.get("/login", (c) => {
  const next = c.req.query("next") || "/";
  const volver = `${origenDe(c)}${next.startsWith("/") ? next : "/"}`;
  return c.redirect(`${LOGIN_CASA}/?volver=${encodeURIComponent(volver)}`);
});

// Pase de la casa → sesión de Video Room. Crea la cuenta (y su sala) si es
// la primera vez, exactamente igual que el login directo con Google.
auth.post("/auth/ct", async (c) => {
  const { pase } = await c.req.json<{ pase?: string }>().catch(() => ({ pase: undefined }));
  // El pase viene emitido para el host que ve el navegador. En local, wrangler
  // pone en la URL el dominio de producción, así que también vale el Host real.
  // "localhost" también vale siempre: un pase para localhost solo lo tiene quien
  // entró desde su propia máquina, y abre su propia cuenta, nada más.
  const hosts = Array.from(new Set([new URL(c.req.url).hostname, (c.req.header("host") || "").split(":")[0], "localhost", "127.0.0.1"].filter(Boolean)));
  const quien = await verificarPase(pase, hosts);
  if (!quien) return c.json({ error: "pase_invalido" }, 401);
  const { userId, isNewUser } = await entrarConPerfil(c, { sub: quien.sub, email: quien.email, name: quien.name || quien.email.split("@")[0], picture: quien.picture || "" });
  const token = await signSession(c.env.SESSION_SECRET, { uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
  ponerSesion(c, token);
  return c.json({ ok: true, nuevo: isNewUser });
});

// Cerrar sesión aquí (lo llama el puente cuando la casa cerró la suya).
auth.post("/auth/salir", (c) => {
  quitarSesion(c);
  return c.json({ ok: true });
});

type Perfil = { sub: string; email: string; name: string; picture: string };
async function entrarConPerfil(c: Context<{ Bindings: Env }>, profile: Perfil): Promise<{ userId: string; isNewUser: boolean }> {
  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE google_id = ?").bind(profile.sub).first<User>();
  let userId: string;
  let isNewUser = false;
  if (existing) {
    userId = existing.id;
    await c.env.DB.prepare("UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?")
      .bind(profile.name, profile.picture || existing.avatar_url, profile.email, userId)
      .run();
  } else {
    isNewUser = true;
    userId = newId("usr");
    const utm = readUtmCookie(c);
    await c.env.DB.prepare(
      `INSERT INTO users (id, google_id, email, name, avatar_url, signup_utm_source, signup_utm_medium, signup_utm_campaign)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      userId, profile.sub, profile.email, profile.name, profile.picture || null,
      utm.utm_source ?? null, utm.utm_medium ?? null, utm.utm_campaign ?? null
    ).run();

    // Toda cuenta nueva recibe su sala con URL numérica desde el primer login.
    const slug = await nextAvailableSlug(c.env.DB);
    await c.env.DB.prepare(
      "INSERT INTO rooms (id, owner_id, slug, title) VALUES (?, ?, ?, ?)"
    ).bind(newId("room"), userId, slug, profile.name).run();

    // Primer correo de su vida en Video Room: su link ya existe. Si Resend
    // falla, el alta sigue igual — nunca debe estorbar el login.
    try {
      await sendEmail(c.env.RESEND_API_KEY, {
        to: profile.email,
        ...welcomeEmail({ appUrl: c.env.APP_URL, name: profile.name, avatarUrl: profile.picture || null, roomUrl: `${c.env.APP_URL}/${slug}` }),
      });
    } catch (err) {
      console.error("welcomeEmail", err);
    }
  }
  return { userId, isNewUser };
}

// Login directo con Google (camino anterior): sigue existiendo por si algún
// link viejo llega aquí, pero el camino normal es la casa.
auth.get("/login/google", (c) => {
  const state = crypto.randomUUID();
  const redirectUri = `${c.env.APP_URL}/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  setCookie(c, "vr_oauth_state", state, { httpOnly: true, secure: true, maxAge: 600, sameSite: "Lax" });
  return c.redirect(url.toString());
});

auth.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = getCookie(c, "vr_oauth_state");
  if (!code || !state || state !== savedState) {
    return c.text("Estado inválido, intenta de nuevo.", 400);
  }

  const redirectUri = `${c.env.APP_URL}/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("No se pudo ingresar con Google. Intenta de nuevo.", 400);
  const tokenJson = await tokenRes.json<{ access_token: string; id_token: string }>();
  if (!tokenJson.access_token) return c.text("No se pudo ingresar con Google. Intenta de nuevo.", 400);

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) return c.text("No se pudo obtener tu perfil de Google. Intenta de nuevo.", 400);
  const profile = await profileRes.json<{ sub: string; email: string; name: string; picture: string }>();
  if (!profile.sub || !profile.email) return c.text("No se pudo obtener tu perfil de Google. Intenta de nuevo.", 400);

  const { userId, isNewUser } = await entrarConPerfil(c, profile);

  const token = await signSession(c.env.SESSION_SECRET, { uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
  ponerSesion(c, token);
  deleteCookie(c, "vr_oauth_state");
  return c.redirect(isNewUser ? "/app/bienvenida" : "/app/monedero");
});

// Salir: aquí y en la casa, para que no vuelva a entrar solo.
auth.get("/auth/logout", (c) => {
  quitarSesion(c);
  return c.redirect(`${LOGIN_CASA}/salir?volver=${encodeURIComponent(`${origenDe(c)}/?ver=1`)}`);
});
