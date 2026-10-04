// RLR · El recibo como objeto: un PDF que la persona quiere guardar.
//
// No es un ticket de Stripe. Es la constancia de que en un segundo exacto
// pasó algo entre dos personas: la hora va en grande, las dos fotos quedan
// amarradas, el creador se lleva el crédito y Video Room firma chiquito
// abajo, como el servicio que es. El mismo archivo se descarga desde el
// correo (con una liga firmada, sin pedir login) y desde Transacciones.
import { PDFDocument, rgb, drawEllipsePath, clip, endPath, pushGraphicsState, popGraphicsState, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Env } from "../env";
import type { Session } from "./db";
import { fmtFechaCompletaCDMX, fmtHoraCDMX, fmtPesos, folioDe } from "./email";
import { momentoEnTransmision, type EventoDinero, type TipoRecibo } from "./recibos";
export { firmaRecibo, urlRecibo } from "./recibos";

// ---------- datos ----------
export interface EventoConPartes extends EventoDinero {
  viewerId: string;
  creatorId: string;
}

type UserRow = { id: string; name: string; email: string; avatar_url: string | null };

/** Carga un movimiento por su id (pass_…, tip_…, mem_…) con todo lo que el
 *  recibo necesita. Null si no existe. */
export async function cargarEvento(env: Env, id: string): Promise<EventoConPartes | null> {
  const prefijo = id.split("_")[0];
  if (prefijo === "pass") {
    const p = await env.DB.prepare(
      `SELECT p.id, p.user_id, p.purchased_at, p.expires_at, p.amount_cents, p.creator_cents,
              s.started_at, s.ended_at, r.slug, r.title, r.owner_id
       FROM passes p JOIN sessions s ON s.id = p.session_id JOIN rooms r ON r.id = s.room_id WHERE p.id = ?`
    ).bind(id).first<{ id: string; user_id: string; purchased_at: number; expires_at: number; amount_cents: number | null; creator_cents: number | null; started_at: number; ended_at: number | null; slug: string; title: string; owner_id: string }>();
    if (!p || !(p.amount_cents ?? 0)) return null;
    return armar(env, "entrada", p.id, p.purchased_at, p.amount_cents ?? 2000, p.creator_cents ?? 1000, p.user_id, p.owner_id, { slug: p.slug, title: p.title }, { started_at: p.started_at, ended_at: p.ended_at }, null, p.expires_at);
  }
  if (prefijo === "tip") {
    const t = await env.DB.prepare(
      `SELECT t.id, t.from_user, t.to_user, t.amount_cents, t.message, t.kind, t.created_at,
              s.started_at, s.ended_at, r.slug, r.title
       FROM tips t JOIN sessions s ON s.id = t.session_id JOIN rooms r ON r.id = s.room_id WHERE t.id = ?`
    ).bind(id).first<{ id: string; from_user: string; to_user: string; amount_cents: number; message: string | null; kind: string | null; created_at: number; started_at: number; ended_at: number | null; slug: string; title: string }>();
    if (!t) return null;
    const tipo: TipoRecibo = t.kind === "highlight" ? "destacado" : t.ended_at !== null && t.created_at > t.ended_at ? "despedida" : "propina";
    return armar(env, tipo, t.id, t.created_at, t.amount_cents, Math.round(t.amount_cents * 0.9), t.from_user, t.to_user, { slug: t.slug, title: t.title }, { started_at: t.started_at, ended_at: t.ended_at }, t.message, tipo === "destacado" ? t.created_at + 180 : null);
  }
  if (prefijo === "mem") {
    const m = await env.DB.prepare(
      `SELECT m.id, m.user_id, m.price_cents, m.creator_cents, m.starts_at, m.expires_at, r.slug, r.title, r.owner_id, r.id as room_id
       FROM memberships m JOIN rooms r ON r.id = m.room_id WHERE m.id = ?`
    ).bind(id).first<{ id: string; user_id: string; price_cents: number; creator_cents: number; starts_at: number; expires_at: number; slug: string; title: string; owner_id: string; room_id: string }>();
    if (!m) return null;
    const s = await env.DB.prepare(
      "SELECT started_at, ended_at FROM sessions WHERE room_id = ? AND started_at <= ? AND (ended_at IS NULL OR ended_at >= ?) ORDER BY started_at DESC LIMIT 1"
    ).bind(m.room_id, m.starts_at, m.starts_at).first<Pick<Session, "started_at" | "ended_at">>();
    return armar(env, "membresia", m.id, m.starts_at, m.price_cents, m.creator_cents, m.user_id, m.owner_id, { slug: m.slug, title: m.title }, s ?? null, null, m.expires_at);
  }
  return null;
}

async function armar(
  env: Env, tipo: TipoRecibo, id: string, at: number, amountCents: number, creatorCents: number,
  viewerId: string, creatorId: string, room: { slug: string; title: string },
  session: Pick<Session, "started_at" | "ended_at"> | null, message: string | null, expiresAt: number | null
): Promise<EventoConPartes | null> {
  const [v, c] = await Promise.all([
    env.DB.prepare("SELECT id, name, email, avatar_url FROM users WHERE id = ?").bind(viewerId).first<UserRow>(),
    env.DB.prepare("SELECT id, name, email, avatar_url FROM users WHERE id = ?").bind(creatorId).first<UserRow>(),
  ]);
  if (!v || !c) return null;
  return {
    tipo, id, at, amountCents, creatorCents,
    appUrl: env.APP_URL,
    room,
    viewer: { name: v.name, email: v.email, avatarUrl: v.avatar_url, balanceAfterCents: 0 },
    creator: { name: c.name, email: c.email, avatarUrl: c.avatar_url, creatorBalanceAfterCents: 0 },
    session: session ? { startedAt: session.started_at, endedAt: session.ended_at } : null,
    message, expiresAt,
    viewerId, creatorId,
  };
}

// ---------- el PDF ----------
const NAVY = rgb(13 / 255, 17 / 255, 23 / 255);
const INK = rgb(26 / 255, 26 / 255, 26 / 255);
const GRIS = rgb(124 / 255, 134 / 255, 150 / 255);
const GRIS_CLARO = rgb(230 / 255, 233 / 255, 239 / 255);
const FONDO = rgb(238 / 255, 241 / 255, 245 / 255);
const VERDE = rgb(86 / 255, 239 / 255, 159 / 255);
const VERDE_OSCURO = rgb(31 / 255, 157 / 255, 92 / 255);
const BLANCO = rgb(1, 1, 1);

const TITULO: Record<TipoRecibo, string> = {
  entrada: "Entrada a la sala",
  propina: "Propina en vivo",
  despedida: "Propina de despedida",
  destacado: "Mensaje destacado",
  membresia: "Membresía mensual",
};

let fuentesCache: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer; extra: ArrayBuffer }> | null = null;
function fuentes(env: Env) {
  if (!fuentesCache) {
    const leer = async (n: string) => {
      const r = await env.ASSETS.fetch(new Request(`https://assets.local/fonts/PlusJakartaSans-${n}.ttf`));
      if (!r.ok) throw new Error(`fuente ${n}: ${r.status}`);
      return r.arrayBuffer();
    };
    fuentesCache = Promise.all([leer("Regular"), leer("Bold"), leer("ExtraBold")]).then(([regular, bold, extra]) => ({ regular, bold, extra }));
    fuentesCache.catch(() => { fuentesCache = null; });
  }
  return fuentesCache;
}

async function foto(doc: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { Accept: "image/jpeg,image/png;q=0.9,*/*;q=0.1" } });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") || "").toLowerCase();
    const bytes = await r.arrayBuffer();
    if (tipo.includes("png")) return await doc.embedPng(bytes);
    if (tipo.includes("jpeg") || tipo.includes("jpg")) return await doc.embedJpg(bytes);
    // Sin tipo claro: se intenta como JPEG y luego PNG.
    try { return await doc.embedJpg(bytes); } catch { return await doc.embedPng(bytes); }
  } catch {
    return null;
  }
}

function iniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "·";
}

/** Foto redonda con anillo; si no hay foto, un círculo con iniciales. */
function dibujarAvatar(page: PDFPage, img: PDFImage | null, nombre: string, cx: number, cy: number, r: number, anillo: ReturnType<typeof rgb>, fondo: ReturnType<typeof rgb>, fuente: PDFFont, textoColor: ReturnType<typeof rgb>) {
  page.drawCircle({ x: cx, y: cy, size: r + 3, color: anillo });
  if (img) {
    page.pushOperators(pushGraphicsState(), ...drawEllipsePath({ x: cx, y: cy, xScale: r, yScale: r }), clip(), endPath());
    page.drawImage(img, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
    page.pushOperators(popGraphicsState());
  } else {
    page.drawCircle({ x: cx, y: cy, size: r, color: fondo });
    const t = iniciales(nombre);
    const size = r * 0.85;
    page.drawText(t, { x: cx - fuente.widthOfTextAtSize(t, size) / 2, y: cy - size * 0.36, size, font: fuente, color: textoColor });
  }
}

function centrado(page: PDFPage, texto: string, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>, ancho: number, x0 = 0) {
  page.drawText(texto, { x: x0 + (ancho - font.widthOfTextAtSize(texto, size)) / 2, y, size, font, color });
}

/** Recorta un texto para que quepa en un ancho, con "…". */
function cabe(texto: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(texto, size) <= max) return texto;
  let t = texto;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

function horaExacta(unix: number): { hora: string; ampm: string } {
  const partes = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).formatToParts(new Date(unix * 1000));
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return { hora: `${g("hour")}:${g("minute")}:${g("second")}`, ampm: g("dayPeriod").replace(/\s/g, "") || "" };
}

function diaLargo(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export async function pdfRecibo(env: Env, ev: EventoDinero): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = await fuentes(env);
  const [regular, bold, extra] = await Promise.all([doc.embedFont(f.regular, { subset: true }), doc.embedFont(f.bold, { subset: true }), doc.embedFont(f.extra, { subset: true })]);
  const [fotoCreador, fotoViewer] = await Promise.all([foto(doc, ev.creator.avatarUrl), foto(doc, ev.viewer.avatarUrl)]);

  const folio = folioDe(ev.id);
  const host = ev.appUrl.replace(/^https?:\/\//, "");
  doc.setTitle(`Recibo ${folio} · ${ev.creator.name}`);
  doc.setAuthor(ev.creator.name);
  doc.setSubject(`${TITULO[ev.tipo]} · ${fmtPesos(ev.amountCents)} MXN`);
  doc.setCreator("Video Room · CapitalTorreon.com");
  doc.setProducer("Video Room");

  const W = 420, H = 850;
  const page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: FONDO });

  // La tarjeta: blanca, con esquinas redondas (rectángulo + círculos).
  const M = 22, R = 18;
  const cx0 = M, cy0 = M, cw = W - 2 * M, ch = H - 2 * M;
  page.drawRectangle({ x: cx0 + R, y: cy0, width: cw - 2 * R, height: ch, color: BLANCO });
  page.drawRectangle({ x: cx0, y: cy0 + R, width: cw, height: ch - 2 * R, color: BLANCO });
  for (const [x, y] of [[cx0 + R, cy0 + R], [cx0 + cw - R, cy0 + R], [cx0 + R, cy0 + ch - R], [cx0 + cw - R, cy0 + ch - R]]) page.drawCircle({ x, y, size: R, color: BLANCO });

  // Banda del creador: oscura, con su foto y su nombre. Es su recibo.
  const bandaH = 236;
  const bandaY = cy0 + ch - bandaH;
  page.drawRectangle({ x: cx0, y: bandaY, width: cw, height: bandaH - R, color: NAVY });
  page.drawRectangle({ x: cx0 + R, y: cy0 + ch - R, width: cw - 2 * R, height: R, color: NAVY });
  page.drawCircle({ x: cx0 + R, y: cy0 + ch - R, size: R, color: NAVY });
  page.drawCircle({ x: cx0 + cw - R, y: cy0 + ch - R, size: R, color: NAVY });
  dibujarAvatar(page, fotoCreador, ev.creator.name, W / 2, bandaY + bandaH - 84, 46, VERDE, rgb(27 / 255, 32 / 255, 41 / 255), extra, BLANCO);
  centrado(page, cabe(ev.creator.name, extra, 24, cw - 40), bandaY + 78, extra, 24, BLANCO, W);
  centrado(page, `${host}/${ev.room.slug}`, bandaY + 58, regular, 10.5, rgb(0.62, 0.66, 0.72), W);
  centrado(page, TITULO[ev.tipo].toUpperCase(), bandaY + 30, bold, 9.5, VERDE, W);

  // El segundo en que pasó: lo más grande de la hoja.
  const { hora, ampm } = horaExacta(ev.at);
  let y = bandaY - 46;
  centrado(page, "EL SEGUNDO EN QUE PASÓ", y, bold, 8.5, GRIS, W); y -= 58;
  const horaSize = 52;
  const anchoHora = extra.widthOfTextAtSize(hora, horaSize), anchoAmpm = bold.widthOfTextAtSize(ampm, 13);
  const xHora = (W - (anchoHora + 8 + anchoAmpm)) / 2;
  page.drawText(hora, { x: xHora, y, size: horaSize, font: extra, color: NAVY });
  page.drawText(ampm, { x: xHora + anchoHora + 8, y: y + 6, size: 13, font: bold, color: GRIS });
  y -= 22;
  centrado(page, diaLargo(ev.at), y, regular, 12, INK, W); y -= 16;
  centrado(page, "hora de Ciudad de México", y, regular, 9, GRIS, W); y -= 24;
  const momento = ev.session && ev.at - ev.session.startedAt < 86400 ? momentoEnTransmision(ev) : ev.session ? "Durante la transmisión" : momentoEnTransmision(ev);
  centrado(page, momento, y, bold, 12, VERDE_OSCURO, W);

  // El vínculo: las dos fotos, unidas.
  y -= 70;
  const xi = W / 2 - 84, xd = W / 2 + 84;
  for (let x = xi + 36; x <= xd - 36; x += 9) page.drawCircle({ x, y: y + 20, size: 1.2, color: GRIS_CLARO });
  // El punto de encuentro: un círculo verde en medio de la línea que une a los dos.
  page.drawCircle({ x: W / 2, y: y + 20, size: 9, color: rgb(243 / 255, 245 / 255, 248 / 255) });
  page.drawCircle({ x: W / 2, y: y + 20, size: 4, color: VERDE_OSCURO });
  dibujarAvatar(page, fotoViewer, ev.viewer.name, xi, y + 20, 27, GRIS_CLARO, rgb(243 / 255, 245 / 255, 248 / 255), extra, NAVY);
  dibujarAvatar(page, fotoCreador, ev.creator.name, xd, y + 20, 27, VERDE, rgb(27 / 255, 32 / 255, 41 / 255), extra, BLANCO);
  const rol = ev.tipo === "entrada" ? "entró" : ev.tipo === "membresia" ? "se hizo miembro" : ev.tipo === "destacado" ? "destacó un mensaje" : "mandó una propina";
  const n1 = cabe(ev.viewer.name, bold, 11, 150), n2 = cabe(ev.creator.name, bold, 11, 150);
  page.drawText(n1, { x: xi - bold.widthOfTextAtSize(n1, 11) / 2, y: y - 20, size: 11, font: bold, color: INK });
  page.drawText(rol, { x: xi - regular.widthOfTextAtSize(rol, 8.5) / 2, y: y - 32, size: 8.5, font: regular, color: GRIS });
  page.drawText(n2, { x: xd - bold.widthOfTextAtSize(n2, 11) / 2, y: y - 20, size: 11, font: bold, color: INK });
  page.drawText("transmitía", { x: xd - regular.widthOfTextAtSize("transmitía", 8.5) / 2, y: y - 32, size: 8.5, font: regular, color: GRIS });

  // Los datos, en renglones: claros, exactos, sin letra chica.
  y -= 66;
  const fee = ev.amountCents - ev.creatorCents;
  const filas: [string, string][] = [
    [`Pagó ${cabe(ev.viewer.name, regular, 9.5, 120)}`, `${fmtPesos(ev.amountCents)} MXN`],
    [`Para ${cabe(ev.creator.name, regular, 9.5, 120)}`, `${fmtPesos(ev.creatorCents)} MXN`],
    ["Comisión de Video Room", `${fmtPesos(fee)} MXN`],
  ];
  if (ev.tipo === "entrada" && ev.expiresAt) filas.push(["La hora valió hasta", `${fmtHoraCDMX(ev.expiresAt)}, hora de Ciudad de México`]);
  if (ev.tipo === "membresia" && ev.expiresAt) filas.push(["Membresía válida hasta", fmtFechaCompletaCDMX(ev.expiresAt)]);
  if (ev.session) filas.push(["Transmisión", `empezó ${fmtHoraCDMX(ev.session.startedAt)} · ${fmtFechaCompletaCDMX(ev.session.startedAt)}`]);
  if (ev.message && ev.message.trim()) filas.push([ev.tipo === "destacado" ? "Mensaje destacado" : "Mensaje", `“${cabe(ev.message.trim(), bold, 9.5, 200)}”`]);
  filas.push(["Grabación", "Ninguna: nada quedó guardado"]);
  const bx = cx0 + 22, bw = cw - 44, rowH = 21;
  const bh = filas.length * rowH + 10;
  page.drawRectangle({ x: bx, y: y - bh, width: bw, height: bh, borderColor: GRIS_CLARO, borderWidth: 1, color: BLANCO });
  filas.forEach(([k, v], i) => {
    const ry = y - 14 - i * rowH;
    if (i) page.drawLine({ start: { x: bx + 1, y: ry + 15 }, end: { x: bx + bw - 1, y: ry + 15 }, thickness: 0.6, color: rgb(238 / 255, 241 / 255, 245 / 255) });
    page.drawText(k, { x: bx + 12, y: ry, size: 9.5, font: regular, color: GRIS });
    const vt = cabe(v, bold, 9.5, bw - 24 - regular.widthOfTextAtSize(k, 9.5) - 12);
    page.drawText(vt, { x: bx + bw - 12 - bold.widthOfTextAtSize(vt, 9.5), y: ry, size: 9.5, font: bold, color: INK });
  });

  // Troquel: la línea punteada y las muescas del boleto.
  const ty = cy0 + 92;
  for (let x = cx0 + 16; x < cx0 + cw - 10; x += 7) page.drawLine({ start: { x, y: ty }, end: { x: x + 3.5, y: ty }, thickness: 1, color: GRIS_CLARO });
  page.drawCircle({ x: cx0, y: ty, size: 9, color: FONDO });
  page.drawCircle({ x: cx0 + cw, y: ty, size: 9, color: FONDO });

  // El talón: folio a la izquierda, monto a la derecha, firma chiquita abajo.
  page.drawText("FOLIO", { x: cx0 + 24, y: ty - 26, size: 7.5, font: bold, color: GRIS });
  page.drawText(folio, { x: cx0 + 24, y: ty - 46, size: 17, font: bold, color: NAVY });
  const monto = `${fmtPesos(ev.amountCents)} MXN`;
  page.drawText("MONTO", { x: cx0 + cw - 24 - bold.widthOfTextAtSize("MONTO", 7.5), y: ty - 26, size: 7.5, font: bold, color: GRIS });
  page.drawText(monto, { x: cx0 + cw - 24 - extra.widthOfTextAtSize(monto, 17), y: ty - 46, size: 17, font: extra, color: NAVY });
  centrado(page, `Emitido por Video Room, un servicio de CapitalTorreon.com · ${host} · Nada se graba.`, cy0 + 16, regular, 7, GRIS, W);

  return doc.save();
}
