// RLR
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { newId, type Room } from "./db";
import type { Env } from "../env";

interface CommentRow {
  name: string;
  body: string;
  created_at: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = rgb(0 / 255, 18 / 255, 64 / 255);
const GREEN = rgb(86 / 255, 239 / 255, 159 / 255);
const GRAY = rgb(0.55, 0.6, 0.7);
const INK = rgb(0.15, 0.18, 0.25);

// Las fuentes estándar de pdf-lib (WinAnsi) no saben codificar emoji ni otros
// símbolos fuera de Latin-1 — intentarlo tira el proceso de archivado entero.
// Los acentos/eñes del español quedan intactos (viven dentro de Latin-1);
// solo se descarta lo que de verdad no se puede dibujar.
function sanitizeForPdf(text: string): string {
  return Array.from(text)
    .filter((ch) => (ch.codePointAt(0) ?? 0) <= 255)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Genera un PDF con la marca de Video Room y la lista de comentarios de la
// transmisión (quién, cuándo, qué dijo). Hoy no hay ninguna pantalla que lo
// muestre — se guarda calladamente en session_transcripts — pero se cuida el
// diseño igual, para el día en que sí se abra.
export async function buildTranscriptPdf(roomTitle: string, comments: CommentRow[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page!: PDFPage;
  let y = 0;

  function drawHeader() {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 56, width: PAGE_WIDTH, height: 56, color: NAVY });
    page.drawText("Video", { x: MARGIN, y: PAGE_HEIGHT - 36, size: 18, font: bold, color: rgb(1, 1, 1) });
    const videoWidth = bold.widthOfTextAtSize("Video", 18);
    page.drawText("Room", { x: MARGIN + videoWidth, y: PAGE_HEIGHT - 36, size: 18, font: bold, color: GREEN });
    y = PAGE_HEIGHT - 90;
  }

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader();
  }

  newPage();
  page.drawText(sanitizeForPdf(roomTitle) || "Video Room", { x: MARGIN, y, size: 15, font: bold, color: NAVY });
  y -= 20;
  const subtitle = `${comments.length} comentario${comments.length === 1 ? "" : "s"} · transmisión en vivo`;
  page.drawText(subtitle, { x: MARGIN, y, size: 10, font: regular, color: GRAY });
  y -= 28;

  for (const comment of comments) {
    const time = new Date(comment.created_at * 1000).toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const name = sanitizeForPdf(comment.name) || "Alguien";
    const body = sanitizeForPdf(comment.body) || "(mensaje con emoji o símbolos)";
    const bodyLines = wrapLines(body, regular, 11, CONTENT_WIDTH);
    const rowHeight = 16 + bodyLines.length * 15 + 10;
    if (y - rowHeight < MARGIN) newPage();

    page.drawText(name, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    const nameWidth = bold.widthOfTextAtSize(name, 11);
    page.drawText(`  ·  ${time}`, { x: MARGIN + nameWidth, y, size: 9, font: regular, color: GRAY });
    y -= 16;
    for (const line of bodyLines) {
      page.drawText(line, { x: MARGIN, y, size: 11, font: regular, color: INK });
      y -= 15;
    }
    y -= 10;
  }

  return doc.save();
}

const MAX_COMMENTS_IN_TRANSCRIPT = 5000;

// Se llama al terminar la transmisión. Si hubo comentarios, arma el PDF y lo
// guarda en la base de datos del creador sin avisar a nadie; en cualquier caso,
// borra los comentarios de la sesión — son eventos fugaces, no sobreviven al
// cierre de la sala.
export async function archiveAndClearComments(env: Env, room: Room, sessionId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT c.body as body, c.created_at as created_at, u.name as name
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.session_id = ? ORDER BY c.created_at ASC LIMIT ?`
  ).bind(sessionId, MAX_COMMENTS_IN_TRANSCRIPT).all<CommentRow>();

  if (results.length > 0) {
    const pdfBytes = await buildTranscriptPdf(room.title, results);
    await env.DB.prepare(
      `INSERT INTO session_transcripts (id, room_id, owner_id, session_id, comment_count, pdf)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId("transcript"), room.id, room.owner_id, sessionId, results.length, pdfBytes.buffer as ArrayBuffer).run();
  }

  await env.DB.prepare("DELETE FROM comments WHERE session_id = ?").bind(sessionId).run();
}
