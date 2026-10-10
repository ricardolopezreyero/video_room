// RLR · El rescatador de links rotos. Todo lo que no se encuentra pasa por
// aquí antes de rendirse: la meta es que casi nadie vea un «no encontrado».
//
// El orden importa, de lo seguro a lo adivinado:
//   1. Ruido (bots buscando wp-login.php, archivos que no existen): 404 plano
//      y barato, sin tocar la base.
//   2. Limpieza determinista: query pegada a la ruta («/ana&utm_source=qr»),
//      URL completa pegada («/https://video…/ana»), extensión («/ana.html»),
//      segmentos de sobra («/ana/chat»), prefijos («/sala/ana», «/@ana»),
//      ceros («/007»). Si lo limpio existe → 301.
//   3. Páginas de la app por su nombre o un sinónimo («/wallet», «/app/stats»,
//      «/ayuda», «/recibos») → 302.
//   4. Adivinanza con red: texto pegado al link («/ana-te-espero»), sin
//      guiones («/anacreadora»), el nombre de la persona («/Ana Creadora»),
//      un dedazo («/ana-cradora»). Solo si hay UNA sala posible → 302, y la
//      sala le dice a la persona que la trajimos («el link decía…»): es
//      dinero, nadie debe pagarle a quien no buscaba.
//   5. Varias posibles o ninguna: la página de «no encontramos», con las
//      salas parecidas a un toque y una caja para escribir el nombre.
// Lo adivinado y lo no resuelto se anota en `enlaces_rotos` para aprender.
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { Env } from "../env";
import { slugify, isNumericSlug, isReservedSlug } from "./slugs";
import { sessionUid } from "./current-user";
import { afterResponse } from "./segundo-plano";
import { escapeHtml } from "./email";

type Ctx = Context<{ Bindings: Env }>;

/* ── 1. ruido ─────────────────────────────────────────────────────────── */
const EXT_RUIDO = /\.(php\d?|aspx?|jsp|cgi|env|ini|bak|old|sql|zip|tar|gz|rar|7z|ya?ml|xml|json|txt|log|js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|exe|sh|py|rb)$/i;
const RUTA_RUIDO = /(^|\/)(\.[a-z]|wp-|wordpress|phpmyadmin|cgi-bin|node_modules|vendor\/|xmlrpc|\.git|\.aws|\.ssh)/i;
export function esRuido(pathname: string): boolean {
  return EXT_RUIDO.test(pathname) || RUTA_RUIDO.test(pathname) || pathname.length > 300;
}

/* ── 2. limpieza ──────────────────────────────────────────────────────── */
const HOST = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|live|mx|net|org|app|io|dev|me|co)$/i;
/** Prefijos que la gente antepone al nombre de la sala. */
const PREFIJOS = new Set(["r", "room", "rooms", "sala", "salas", "live", "en-vivo", "envivo", "u", "user", "usuario", "c", "canal", "v", "ver", "watch", "s", "video", "videoroom", "video-room", "de", "con"]);

export function limpiarRuta(pathname: string, search: string): { segmentos: string[]; search: string; escrito: string } {
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* se queda como vino */ }
  const escrito = p.replace(/^\/+/, "").slice(0, 80);
  // «/ana&utm_source=qr» o «/ana%3Futm_source=qr»: la query venía pegada.
  let extra = "";
  const corte = p.search(/[?&#]/);
  if (corte >= 0) {
    if (p[corte] !== "#") extra = p.slice(corte + 1).split("&").filter((par) => /^[\w.-]+=/.test(par)).join("&");
    p = p.slice(0, corte);
  }
  const q = extra ? (search && search.length > 1 ? `${search}&${extra}` : `?${extra}`) : search;
  const segmentos = p.split("/").map((s) => s.trim()).filter(Boolean)
    .filter((s) => !/^https?:?$/i.test(s) && !HOST.test(s))
    .map((s) => s.replace(/\.html?$/i, ""))
    .filter(Boolean);
  return { segmentos, search: q, escrito };
}

/* ── 3. páginas de la app ─────────────────────────────────────────────── */
const PAGINAS: Record<string, string[]> = {
  "/app/monedero": ["monedero", "wallet", "saldo", "cartera", "billetera", "dinero", "recargar", "recarga", "retirar", "retiro", "retiros", "pagos", "pago", "cuenta", "mi-cuenta", "perfil", "panel", "dashboard", "ajustes", "configuracion", "settings", "mi-sala", "crear", "crear-sala", "qr", "codigo-qr", "link", "mi-link", "banco"],
  "/app/monedero#correos": ["correos", "correo", "notificaciones", "emails", "email", "avisos", "preferencias"],
  "/app/estadisticas": ["estadisticas", "estadistica", "stats", "analiticas", "analytics", "metricas", "numeros", "reportes", "reporte", "ganancias", "corte"],
  "/app/transacciones": ["transacciones", "movimientos", "historial", "recibos", "recibo", "tickets", "ticket", "facturas", "compras"],
  "/app/faq": ["faq", "faqs", "ayuda", "help", "soporte", "support", "preguntas", "dudas", "precios", "precio", "pricing", "comisiones", "comision", "como-funciona", "contacto", "contact"],
  "/app/manifiesto": ["manifiesto", "privacidad", "privacy", "terminos", "terms", "legal", "nosotros", "about", "acerca", "acerca-de"],
  "/app/bienvenida": ["bienvenida", "welcome", "onboarding", "empezar", "comenzar"],
  "/app/api": ["api", "api-docs", "docs", "developers", "desarrolladores", "integraciones", "webhooks", "embed"],
  "/app/materiales": ["materiales", "material", "kit", "kit-de-prensa", "prensa", "press", "media", "marca", "brand", "compartir", "promocion", "promo", "disenos", "plantillas", "portadas", "imagenes", "recursos", "descargas", "guia-estilos"],
};
const RAIZ: Record<string, string> = {
  home: "/", inicio: "/", index: "/", principal: "/", www: "/", videoroom: "/", "video-room": "/",
  entrar: "/login", ingresar: "/login", acceder: "/login", signin: "/login", "sign-in": "/login", signup: "/login", "sign-up": "/login", registro: "/login", registrarse: "/login", registrar: "/login", login: "/login",
  salir: "/auth/logout", logout: "/auth/logout",
};
const PALABRA_A_PAGINA = new Map<string, string>();
for (const [pagina, palabras] of Object.entries(PAGINAS)) for (const w of palabras) PALABRA_A_PAGINA.set(w, pagina);

export function paginaPorPalabra(palabra: string, { cercana = false } = {}): string | null {
  const w = slugify(palabra);
  if (!w) return null;
  const exacta = PALABRA_A_PAGINA.get(w);
  if (exacta) return exacta;
  if (!cercana || w.length < 4) return null;
  let mejor: string | null = null, d0 = 99, empate = false;
  for (const [k, pagina] of PALABRA_A_PAGINA) {
    const d = distancia(w, k, 2);
    if (d < d0) { d0 = d; mejor = pagina; empate = false; } else if (d === d0 && pagina !== mejor) empate = true;
  }
  return d0 <= (w.length >= 8 ? 2 : 1) && !empate ? mejor : null;
}

/* ── 4. distancia (Damerau–Levenshtein acotada: dedazos y letras volteadas) ── */
export function distancia(a: string, b: string, tope = 3): number {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > tope) return tope + 1;
  let prev2: number[] = [], prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let min = i;
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < min) min = v;
    }
    if (min > tope) return tope + 1;
    prev2 = prev; prev = cur;
  }
  return prev[m];
}
/** Cuántos dedazos perdonamos según el largo de lo escrito. */
export function umbral(largo: number): number {
  return largo < 4 ? 0 : largo < 8 ? 1 : 2;
}

interface Candidato { slug: string; title: string; destino: string }

/** Entre todas las salas (con sus direcciones anteriores y el nombre de la
 *  persona), las que se parecen a lo escrito. Devuelve destinos únicos,
 *  del más parecido al menos, con su puntaje (0 = igual salvo guiones). */
export function parecidos(escrito: string, candidatos: Candidato[]): { destino: string; d: number; cortado: boolean }[] {
  const a = escrito, plano = a.replace(/-/g, "");
  const u = umbral(plano.length);
  const mejor = new Map<string, number>();
  // Links cortados: lo escrito es el principio de la dirección de la sala
  // («…/consultorio-lu» por un salto de línea o un mensaje truncado).
  const cortados = new Set<string>();
  const anotar = (destino: string, d: number) => { const x = mejor.get(destino); if (x === undefined || d < x) mejor.set(destino, d); };
  for (const c of candidatos) {
    const llaves = [c.slug];
    const t = slugify(c.title);
    if (t && t !== c.slug) llaves.push(t);
    for (const k of llaves) {
      if (isNumericSlug(k)) continue; // los números no se adivinan: /12 y /13 son personas distintas
      const kp = k.replace(/-/g, "");
      if (kp === plano) { anotar(c.destino, 0); continue; }
      if (u > 0) { const d = distancia(a, k, u); if (d <= u) { anotar(c.destino, d); continue; } }
      // para sugerir (no para redirigir): empieza igual o lo contiene
      if (plano.length >= 4 && k === c.slug && kp.startsWith(plano)) cortados.add(c.destino);
      if (plano.length >= 3 && (kp.startsWith(plano) || (plano.length >= 5 && plano.startsWith(kp) && kp.length >= 4))) anotar(c.destino, u + 1);
      else if (u > 0 && distancia(a, k, u + 1) === u + 1) anotar(c.destino, u + 2);
    }
  }
  return [...mejor.entries()].map(([destino, d]) => ({ destino, d, cortado: cortados.has(destino) })).sort((x, y) => x.d - y.d || x.destino.localeCompare(y.destino));
}

/* ── consultas ────────────────────────────────────────────────────────── */
async function exactos(env: Env, slugs: string[]): Promise<Map<string, string>> {
  const lista = [...new Set(slugs.filter((s) => s && !isReservedSlug(s)))].slice(0, 12);
  const out = new Map<string, string>();
  if (!lista.length) return out;
  const marcas = lista.map(() => "?").join(",");
  const r = await env.DB.prepare(
    `SELECT slug, slug as destino FROM rooms WHERE slug IN (${marcas})
     UNION ALL SELECT a.slug as slug, r.slug as destino FROM slug_aliases a JOIN rooms r ON r.id = a.room_id WHERE a.slug IN (${marcas})`
  ).bind(...lista, ...lista).all<{ slug: string; destino: string }>();
  for (const x of r.results) if (!out.has(x.slug)) out.set(x.slug, x.destino);
  return out;
}
async function todosLosCandidatos(env: Env): Promise<Candidato[]> {
  // Un viaje, solo en el camino del «no encontrado». Con decenas de miles de
  // salas esto pide un índice de trigramas; hoy caben de sobra en memoria.
  const r = await env.DB.prepare(
    `SELECT slug, title, slug as destino FROM rooms
     UNION ALL SELECT a.slug as slug, '' as title, r.slug as destino FROM slug_aliases a JOIN rooms r ON r.id = a.room_id
     LIMIT 30000`
  ).all<Candidato>();
  return r.results;
}
async function registrar(env: Env, path: string, resuelto: string | null): Promise<void> {
  if (!path || path.length > 80 || path.split("/").length > 4) return;
  await env.DB.prepare(
    "INSERT INTO enlaces_rotos (path, resuelto) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET veces = veces + 1, ultimo = unixepoch(), resuelto = excluded.resuelto"
  ).bind(path, resuelto).run().catch(() => {});
}

/* ── el rescatador ────────────────────────────────────────────────────── */
export async function rescatar(c: Ctx): Promise<Response> {
  const url = new URL(c.req.url);
  const path = url.pathname;
  if (/^\/(api|webhook|auth|ws)\//.test(path)) return c.json({ error: "not_found" }, 404);
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.text("No encontrado.", 404);
  if (esRuido(path)) return c.text("No encontrado.", 404, { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" });

  const { segmentos, search, escrito } = limpiarRuta(path, url.search);
  const ir = (a: string, permanente: boolean) => {
    const [ruta, ancla] = a.split("#");
    return c.redirect(`${ruta}${ruta.startsWith("/app/") || ruta === "/" || ruta.startsWith("/login") || ruta.startsWith("/auth") ? "" : search}${ancla ? "#" + ancla : ""}`, permanente ? 301 : 302);
  };
  // A una sala que adivinamos se llega avisando: «el link decía…».
  const irAdivinando = (slug: string) => {
    setCookie(c, "vr_trajo", encodeURIComponent(escrito.slice(0, 60)), { path: "/", maxAge: 30, sameSite: "Lax" });
    afterResponse(c, registrar(c.env, escrito, `/${slug}`));
    return ir(`/${slug}`, false);
  };
  if (!segmentos.length) return ir("/", false);

  // Páginas de la app: /app, /app/wallet, /app/monedero/lo-que-sea
  if (slugify(segmentos[0]) === "app") {
    const pagina = segmentos[1] ? (paginaPorPalabra(segmentos[1], { cercana: true }) ?? "/app/monedero") : "/app/monedero";
    return ir(pagina, false);
  }

  // Prefijos de sobra: /sala/ana, /r/ana/chat, /live/ana
  const segs = [...segmentos];
  while (segs.length > 1 && PREFIJOS.has(slugify(segs[0]))) segs.shift();
  const limpios = segs.map((s) => slugify(s)).filter(Boolean);
  const a = limpios[0] || "";
  if (!a) return pagina404(c, escrito, []);

  // Exacto tras limpiar (el primero manda; luego los demás segmentos) y ceros a la izquierda.
  const sinCeros = /^0+\d+$/.test(a) ? String(Number(a)) : "";
  const ex = await exactos(c.env, [a, sinCeros, ...limpios.slice(1)]);
  for (const s of [a, sinCeros, ...limpios.slice(1)]) { const d = s && ex.get(s); if (d) return ir(`/${d}`, true); }

  // Una palabra que es una página nuestra: /wallet, /ayuda, /recibos, /entrar
  if (limpios.length === 1 || isReservedSlug(a)) {
    const destino = RAIZ[a] ?? paginaPorPalabra(a);
    if (destino) return ir(destino, false);
  }
  if (isReservedSlug(a) && limpios.length === 1) return pagina404(c, escrito, []);

  if (!isNumericSlug(a)) {
    // Texto pegado al link: «ana-te-espero», «sala-de-ana», «ana-html».
    const fichas = a.split("-");
    if (fichas.length > 1) {
      const trozos: string[] = [];
      for (let n = fichas.length - 1; n >= 1; n--) trozos.push(fichas.slice(0, n).join("-"));
      for (let n = 1; n < fichas.length; n++) trozos.push(fichas.slice(n).join("-"));
      const utiles = trozos.filter((t) => t.length >= 3 && !isNumericSlug(t) && !PREFIJOS.has(t));
      const ex2 = await exactos(c.env, utiles);
      for (const t of utiles) { const d = ex2.get(t); if (d) return irAdivinando(d); }
    }
    // Sin guiones, por el nombre de la persona, o con un dedazo.
    const cand = parecidos(a, await todosLosCandidatos(c.env));
    const u = umbral(a.replace(/-/g, "").length);
    const firmes = cand.filter((x) => x.d <= u);
    if (firmes.length === 1) return irAdivinando(firmes[0].destino);
    // Link cortado: es el principio de la dirección de una sola sala.
    const cortados = cand.filter((x) => x.cortado);
    if (!firmes.length && cortados.length === 1) return irAdivinando(cortados[0].destino);
    afterResponse(c, registrar(c.env, escrito, null));
    return pagina404(c, escrito, cand.slice(0, 3).map((x) => x.destino));
  }
  afterResponse(c, registrar(c.env, escrito, null));
  return pagina404(c, escrito, []);
}

/* ── 5. la página ─────────────────────────────────────────────────────── */
async function pagina404(c: Ctx, escrito: string, slugs: string[]): Promise<Response> {
  const [uid, salas] = await Promise.all([
    sessionUid(c).catch(() => null),
    slugs.length
      ? c.env.DB.prepare(
          `SELECT r.slug, r.title, u.avatar_url, EXISTS(SELECT 1 FROM sessions s WHERE s.room_id = r.id AND s.status = 'live') as live
           FROM rooms r JOIN users u ON u.id = r.owner_id WHERE r.slug IN (${slugs.map(() => "?").join(",")})`
        ).bind(...slugs).all<{ slug: string; title: string; avatar_url: string | null; live: number }>().then((r) => r.results).catch(() => [])
      : Promise.resolve([] as { slug: string; title: string; avatar_url: string | null; live: number }[]),
  ]);
  const orden = new Map(slugs.map((s, i) => [s, i]));
  salas.sort((x, y) => (orden.get(x.slug) ?? 9) - (orden.get(y.slug) ?? 9));
  const host = new URL(c.env.APP_URL).host;
  // Misma versión de estilos que la sala: nunca un style.css viejo en caché.
  const v = (c.env.CF_VERSION_METADATA?.id ?? "").slice(0, 8) || String(Math.floor(Date.now() / 10000));
  return c.html(paginaNoEncontrada({ escrito, salas, conSesion: !!uid, host, v }), 404, { "X-Robots-Tag": "noindex", "Cache-Control": "private, no-store" });
}

export function paginaNoEncontrada(o: { escrito: string; salas: { slug: string; title: string; avatar_url: string | null; live: number }[]; conSesion: boolean; host: string; v?: string }): string {
  const escrito = o.escrito.trim();
  const lista = o.salas.map((s) => `
      <a class="nf-sala" href="/${escapeHtml(s.slug)}">
        ${s.avatar_url && /^https:\/\//.test(s.avatar_url) ? `<img src="${escapeHtml(s.avatar_url)}" alt="" width="44" height="44" referrerpolicy="no-referrer">` : `<span class="nf-inicial">${escapeHtml((s.title || s.slug).trim().charAt(0).toUpperCase())}</span>`}
        <span class="nf-txt"><b>${escapeHtml(s.title || s.slug)}${s.live ? ' <i class="nf-vivo">EN VIVO</i>' : ""}</b><small>${escapeHtml(o.host)}/${escapeHtml(s.slug)}</small></span>
        <span class="nf-ir">Entrar</span>
      </a>`).join("");
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>No encontramos esa sala — Video Room</title>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css${o.v ? `?v=${encodeURIComponent(o.v)}` : ""}"></head>
<body class="app-shell">
  <div class="onboarding-wrap"><div class="onboarding-card nf">
    <div class="onboarding-emoji">🔍</div>
    <h2>${o.salas.length ? "¿Buscabas esta sala?" : "No encontramos esa sala"}</h2>
    <p class="muted">${escrito ? `El link decía <strong>${escapeHtml(escrito)}</strong>. ` : ""}${o.salas.length ? (o.salas.length === 1 ? "Es la que más se le parece." : "Estas son las que más se le parecen.") : "Puede faltarle una letra o venir cortado."}</p>
    ${lista ? `<div class="nf-lista">${lista}</div>` : ""}
    <form class="nf-buscar" id="nf-form" action="/" method="get">
      <label for="nf-q">${o.salas.length ? "¿No es ninguna? Escribe el nombre de la sala o de la persona:" : "Escribe el nombre de la sala o de la persona:"}</label>
      <div><input id="nf-q" name="q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="por ejemplo: ana" value=""><button class="btn-primary" type="submit">Ir</button></div>
    </form>
    <p class="muted nf-pie">Si alguien te mandó el link, pídele que te lo reenvíe: su sala sigue existiendo aunque haya cambiado de dirección.</p>
    <p class="nf-botones">${o.conSesion ? `<a href="/app/monedero"><button class="btn-ghost">Ir a mi monedero</button></a>` : `<a href="/login"><button class="btn-ghost">Crear mi sala gratis</button></a>`}<a href="/?ver=1"><button class="btn-ghost">Qué es Video Room</button></a></p>
  </div></div>
  <script>
    // La caja lleva a /<lo escrito>: el mismo rescatador lo resuelve (nombre, dedazo, dirección vieja).
    document.getElementById("nf-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = document.getElementById("nf-q").value.trim().replace(/^https?:\\/\\/[^/]+\\//i, "").replace(/^[@/]+/, "");
      if (v) location.href = "/" + encodeURIComponent(v);
    });
  </script>
</body></html>`;
}
