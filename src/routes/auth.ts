import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../lib/session";
import { newId, type User } from "../lib/db";
import { nextAvailableSlug } from "../lib/slugs";
import { readUtmCookie } from "../lib/utm";
import type { Env } from "../env";

export const auth = new Hono<{ Bindings: Env }>();

auth.get("/login", (c) => {
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

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE google_id = ?").bind(profile.sub).first<User>();
  let userId: string;
  let isNewUser = false;
  if (existing) {
    userId = existing.id;
    await c.env.DB.prepare("UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?")
      .bind(profile.name, profile.picture, profile.email, userId)
      .run();
  } else {
    isNewUser = true;
    userId = newId("usr");
    const utm = readUtmCookie(c);
    await c.env.DB.prepare(
      `INSERT INTO users (id, google_id, email, name, avatar_url, signup_utm_source, signup_utm_medium, signup_utm_campaign)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      userId, profile.sub, profile.email, profile.name, profile.picture,
      utm.utm_source ?? null, utm.utm_medium ?? null, utm.utm_campaign ?? null
    ).run();

    // Toda cuenta nueva recibe su sala con URL numérica desde el primer login.
    const slug = await nextAvailableSlug(c.env.DB);
    await c.env.DB.prepare(
      "INSERT INTO rooms (id, owner_id, slug, title) VALUES (?, ?, ?, ?)"
    ).bind(newId("room"), userId, slug, profile.name).run();
  }

  const token = await signSession(c.env.SESSION_SECRET, { uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  deleteCookie(c, "vr_oauth_state");
  return c.redirect(isNewUser ? "/bienvenida" : "/monedero");
});

auth.get("/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/");
});
