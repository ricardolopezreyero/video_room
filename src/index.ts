// RLR
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { UTM_COOKIE } from "./lib/utm";
import type { Env } from "./env";
import { auth } from "./routes/auth";
import { wallet } from "./routes/wallet";
import { rooms } from "./routes/rooms";
import { calls } from "./routes/calls";
import { stats } from "./routes/stats";
import { notifications } from "./routes/notifications";
import { phrase } from "./routes/phrase";
import { apiV1 } from "./routes/api-v1";
import { renderRoomPage } from "./lib/room-page";
import { verifyUnsubscribeToken } from "./lib/unsubscribe";
import { currentUser } from "./lib/current-user";
import { endLiveSession } from "./lib/room-lifecycle";
import { sendEmail } from "./lib/email";
import { isReservedSlug } from "./lib/slugs";
import { publicStatusRead, evaluateRelics } from "./lib/status";
import { HIGHLIGHT_OPTIONS_CENTS } from "./lib/pricing";
import type { Room, Session } from "./lib/db";
import { afterResponse } from "./lib/segundo-plano";

const ADMIN_EMAIL = "Ricardo@superleads.mx";

export { RoomDurableObject } from "./durable/room";

const _RLR = "Ricardo López Reyero";
const _k = "EYE", _rev = 181218; // RLR build marker

const app = new Hono<{ Bindings: Env }>();
void _RLR;
void _k;
void _rev;

// Los links de sala ahora viven en la raíz (/:slug) y ese patrón de Hono no
// hace match con una barra final — sin esto, "videoroom.live/ricardo/"
// (fácil de teclear de más, o de que un cliente/red social la agregue sola)
// caía en un 404 genérico en vez de abrir la sala. Con GET/HEAD alcanza:
// nada más se comparte o se teclea a mano con esos métodos.
// El proyecto vive en video.capitaltorreon.com. El dominio anterior
// (videoroom.live) sigue atado al Worker solo para que los links viejos no
// mueran: cualquier petición que llegue por ahí se manda al nuevo con 301,
// conservando ruta y query. Los webhooks/API no pasan por aquí porque
// Stripe y el cliente ya apuntan al dominio nuevo.
const DOMINIOS_VIEJOS = new Set(["videoroom.live", "www.videoroom.live"]);
app.use(async (c, next) => {
  const url = new URL(c.req.url);
  if (DOMINIOS_VIEJOS.has(url.hostname)) {
    url.protocol = "https:";
    url.hostname = new URL(c.env.APP_URL).hostname;
    url.port = "";
    return c.redirect(url.toString(), 301);
  }
  if ((c.req.method === "GET" || c.req.method === "HEAD") && url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return c.redirect(url.pathname + url.search, 301);
  }
  await next();
});

app.onError((err, c) => {
  console.error(err);
  // Cloudflare Workers Logs ya guarda esto (observability activado en
  // wrangler.toml), pero eso es reactivo — solo lo ves si vas a buscarlo. Este
  // correo es la parte proactiva: te enteras de un error real sin tener que
  // ir a revisar logs. No hay límite de frecuencia a propósito — un error sin
  // manejar debería ser raro; si no lo es, los correos mismos son la señal.
  afterResponse(
    c,
    sendEmail(c.env.RESEND_API_KEY, {
      to: ADMIN_EMAIL,
      subject: `🔴 Error en Video Room: ${c.req.method} ${c.req.path}`,
      html: `<pre style="white-space:pre-wrap; font-family:monospace;">${String(err?.stack || err)}</pre>`,
      text: String(err?.stack || err),
    })
  );
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/webhook/")) {
    return c.json({ error: "error_interno" }, 500);
  }
  return c.text("Algo salió mal. Intenta de nuevo en un momento.", 500);
});

app.route("/", auth);
app.route("/", wallet);
app.route("/", rooms);
app.route("/", calls);
app.route("/", stats);
app.route("/", notifications);
app.route("/", phrase);
app.route("/", apiV1);

// Las salas vivían en /r/:slug — ahora viven en la raíz (videoroom.live/:slug,
// links más cortos y pegados al dominio). Los links viejos siguen sirviendo
// vía 301 en vez de romperse de golpe.
app.get("/r/:slug", (c) => c.redirect(`/${c.req.param("slug")}${new URL(c.req.url).search}`, 301));

// Las páginas de la app vivían en la raíz — se movieron a /app/* para dejar
// la raíz libre exclusivamente para slugs de sala. Mismo trato: 301 en vez de
// romper cualquier link o marcador ya compartido.
const MOVED_TO_APP = ["manifiesto", "faq", "monedero", "estadisticas", "transacciones", "bienvenida"];
for (const page of MOVED_TO_APP) {
  app.get(`/${page}`, (c) => c.redirect(`/app/${page}${new URL(c.req.url).search}`, 301));
}

// Los navegadores piden /favicon.ico solos, sin que ninguna página lo
// declare — sin esto caía en el catch-all de sala y gastaba una consulta a
// la base de datos solo para devolver "sala no encontrada".
app.get("/favicon.ico", (c) => c.redirect("/og-default.svg", 301));

// Verificación de propiedad en Google Search Console (método de archivo
// HTML). Va como ruta del Worker y no como archivo estático porque
// html_handling normaliza "*.html" quitándole la extensión con un redirect —
// y el verificador de Google necesita esta URL exacta, sin redirect de por
// medio, o la verificación falla.
app.get("/google418ea42a297ed4f5.html", (c) => c.text("google-site-verification: google418ea42a297ed4f5.html"));
app.get("/googlec627d281a5ee7cec.html", (c) => c.text("google-site-verification: googlec627d281a5ee7cec.html"));

// Sitemap dinámico: cada sala es una URL propia y permanente — entre más
// completo el sitemap, más rápido las indexa Google y más gente nueva
// encuentra al creador cuando busca su nombre o su nicho.
app.get("/sitemap.xml", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT slug, slug_assigned_at FROM rooms ORDER BY slug_assigned_at DESC LIMIT 50000"
  ).all<{ slug: string; slug_assigned_at: number }>();

  const urls = results
    .map((r) => {
      const lastmod = new Date(r.slug_assigned_at * 1000).toISOString().slice(0, 10);
      return `<url><loc>${c.env.APP_URL}/${r.slug}</loc><lastmod>${lastmod}</lastmod></url>`;
    })
    .join("");

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      `<url><loc>${c.env.APP_URL}/</loc></url><url><loc>${c.env.APP_URL}/app/api</loc></url>${urls}</urlset>`,
    200,
    { "Content-Type": "application/xml; charset=utf-8" }
  );
});

function roomNotFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sala no encontrada — Video Room</title>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"></head>
<body class="app-shell">
  <div class="onboarding-wrap"><div class="onboarding-card">
    <div class="onboarding-emoji">🔍</div>
    <h2>No encontramos esta sala</h2>
    <p class="muted">El link puede estar mal escrito o la sala ya cambió de URL.</p>
    <p><a href="/" style="color:var(--green)">Volver a Video Room</a></p>
  </div></div>
</body></html>`;
}

async function handleUnsubscribe(c: Context<{ Bindings: Env }>) {
  let token = c.req.query("token");
  if (!token && c.req.method === "POST") {
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    if (typeof body["token"] === "string") token = body["token"];
  }
  if (!token) return c.html(unsubscribePage("El link no es válido."), 400);
  const data = await verifyUnsubscribeToken(c.env.SESSION_SECRET, token);
  if (!data) return c.html(unsubscribePage("El link no es válido o ya expiró."), 400);
  await c.env.DB.prepare("DELETE FROM notify_me WHERE room_id = ? AND user_id = ?").bind(data.roomId, data.userId).run();
  return c.html(unsubscribePage("Listo, ya no te avisaremos cuando esta sala abra."));
}

function unsubscribePage(message: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Video Room</title>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"></head>
<body class="app-shell">
  <div class="onboarding-wrap"><div class="onboarding-card">
    <div class="onboarding-emoji">🔕</div>
    <h2>${message}</h2>
    <p><a href="/" style="color:var(--green)">Volver a Video Room</a></p>
  </div></div>
</body></html>`;
}

app.get("/unsubscribe", handleUnsubscribe);
app.post("/unsubscribe", handleUnsubscribe);

app.get("/ws/room/:slug", async (c) => {
  const slug = c.req.param("slug");
  const [room, user] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM rooms WHERE slug = ?").bind(slug).first<Room>(),
    currentUser(c),
  ]);
  if (!room) return c.notFound();
  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const doUrl = new URL("https://do/ws");
  if (user) doUrl.searchParams.set("uid", user.id);
  const cid = c.req.query("cid");
  if (cid) doUrl.searchParams.set("cid", cid);
  // Marca si esta conexión es la del propio creador — así el conteo de
  // "espectadores viendo" no se infla con su propia pestaña abierta.
  if (user && user.id === room.owner_id) doUrl.searchParams.set("owner", "1");
  return stub.fetch(doUrl.toString(), c.req.raw);
});

// Catch-all al final a propósito: cualquier ruta real de la app (auth, api,
// webhook, ws, unsubscribe, /app/*, los redirects de arriba) ya hizo match
// antes de llegar aquí, así que un segmento suelto en la raíz solo puede ser
// el slug de una sala.
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (isReservedSlug(slug)) return c.html(roomNotFoundPage(), 404);

  const utmSource = c.req.query("utm_source");
  const utmMedium = c.req.query("utm_medium");
  const utmCampaign = c.req.query("utm_campaign");
  if (utmSource || utmMedium || utmCampaign) {
    const data = JSON.stringify({ utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign });
    setCookie(c, UTM_COOKIE, data, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "Lax",
    });
  }

  // Camino crítico de todo el producto: es el link que se comparte. Antes
  // eran ~10 consultas en serie (≈1 s de espera) y luego room.js pedía tres
  // cosas más antes de ser usable. Ahora: dos rondas en paralelo, y lo que
  // room.js necesita al arrancar (estado, quién soy, oferta) va incrustado
  // en el HTML. La sala es usable en cuanto se pinta.
  const [room, user] = await Promise.all([
    c.env.DB.prepare(
      "SELECT rooms.*, users.avatar_url as owner_avatar FROM rooms JOIN users ON users.id = rooms.owner_id WHERE rooms.slug = ?"
    ).bind(slug).first<Room & { owner_avatar: string | null }>(),
    currentUser(c).catch(() => null),
  ]);
  if (!room) return c.html(roomNotFoundPage(), 404);

  const stub = c.env.ROOM_DO.get(c.env.ROOM_DO.idFromName(room.id));
  const [live, status, membership, info] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'live'").bind(room.id).first<Session>(),
    // Estatus público del creador (rango + reliquias), solo lectura. Si
    // falla, la sala se pinta igual, sin estatus.
    publicStatusRead(c.env, room.owner_id).catch(() => null),
    user
      ? c.env.DB.prepare(
          "SELECT expires_at FROM memberships WHERE room_id = ? AND user_id = ? AND expires_at > unixepoch() ORDER BY expires_at DESC LIMIT 1"
        ).bind(room.id, user.id).first<{ expires_at: number }>()
      : Promise.resolve(null),
    stub.fetch("https://do/sfu-session").then((r) => r.json<{ viewerCount?: number }>()).catch(() => ({ viewerCount: 0 })),
  ]);
  // Las reliquias pendientes se otorgan después de responder: lo ganado se
  // ve en la siguiente visita, y esta no espera por ello.
  afterResponse(c, evaluateRelics(c.env, room.owner_id));

  const viewerCount = live ? (info.viewerCount ?? 0) : 0;
  const { owner_avatar, ...roomRow } = room;
  const inicio = {
    // Misma forma que /api/rooms/:slug/status, /api/wallet/me y
    // /api/rooms/:slug/offer: room.js no distingue de dónde vinieron.
    status: { room: roomRow, live_session: live ?? null },
    me: user
      ? { id: user.id, name: user.name, avatar_url: user.avatar_url, balance_cents: user.balance_cents, creator_balance_cents: user.creator_balance_cents }
      : null,
    offer: {
      price_cents: room.price_cents || 2000,
      membership_cents: room.membership_cents,
      tip_goal_cents: room.tip_goal_cents,
      highlight_options_cents: HIGHLIGHT_OPTIONS_CENTS,
      member_until: membership?.expires_at ?? null,
    },
  };

  // El HTML lleva datos de quien lo pide: nunca compartido, nunca servido
  // viejo. Link: lo que la página va a necesitar, anunciado desde ya
  // (Early Hints) para que baje en paralelo con el HTML mismo.
  c.header("Cache-Control", "private, no-cache");
  c.header(
    "Link",
    "</style.css>; rel=preload; as=style, </veloz.js>; rel=preload; as=script, </room.js>; rel=preload; as=script, </fonts/plus-jakarta-sans.woff2>; rel=preload; as=font; type=font/woff2; crossorigin"
  );
  return c.html(
    renderRoomPage({ room: roomRow, ownerAvatar: owner_avatar, live: !!live, viewerCount, appUrl: c.env.APP_URL, status, inicio })
  );
});

// Umbral generoso: solo atrapa salas realmente abandonadas (el creador cerró
// la pestaña sin tocar "Terminar" y nadie más nunca la cerró) — nunca
// interrumpe una transmisión real en curso.
const STALE_SESSION_SECONDS = 8 * 60 * 60;

// Si nadie cierra una sala "en vivo" a mano, se queda así para siempre: los
// espectadores nuevos podrían pagar por entrar a una sala que en realidad ya
// no transmite nada. Este cron la cierra sola pasado el umbral.
async function cleanupStaleLiveSessions(env: Env): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - STALE_SESSION_SECONDS;
  const { results } = await env.DB.prepare(
    `SELECT s.id as session_id, s.room_id, s.started_at, s.ended_at, s.status,
            r.id as r_id, r.owner_id, r.slug, r.title, r.blur_preview, r.created_at as r_created_at, r.slug_assigned_at
     FROM sessions s JOIN rooms r ON r.id = s.room_id
     WHERE s.status = 'live' AND s.started_at < ?`
  ).bind(cutoff).all<{
    session_id: string; room_id: string; started_at: number; ended_at: number | null; status: "live" | "ended";
    r_id: string; owner_id: string; slug: string; title: string; blur_preview: number; r_created_at: number; slug_assigned_at: number;
  }>();

  for (const row of results) {
    const room: Room = {
      id: row.r_id,
      owner_id: row.owner_id,
      slug: row.slug,
      title: row.title,
      blur_preview: row.blur_preview,
      price_cents: 2000,
      membership_cents: null,
      tip_goal_cents: null,
      created_at: row.r_created_at,
      slug_assigned_at: row.slug_assigned_at,
    };
    const session: Session = { id: row.session_id, room_id: row.room_id, started_at: row.started_at, ended_at: row.ended_at, status: row.status };
    await endLiveSession(env, room, session).catch((err) => console.error("cleanupStaleLiveSessions", err));
  }
}

export { app, cleanupStaleLiveSessions };
export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(cleanupStaleLiveSessions(env));
  },
};
