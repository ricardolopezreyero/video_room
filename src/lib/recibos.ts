// RLR · Recibos de dinero: el sello entre las dos partes.
//
// Cada vez que se mueve dinero entre quien ve y quien transmite (entrada,
// propina, propina de despedida, mensaje destacado, membresía) salen DOS
// correos en el mismo segundo: uno a cada parte, con el mismo folio, la misma
// fecha y hora exacta, el mismo minuto de la transmisión y los mismos montos
// (lo que se pagó, lo que recibe el creador, la comisión). Son la prueba,
// para los dos, de que estuvieron ahí en ese momento.
//
// Nada de esto toca el dinero: el cobro ya quedó hecho y guardado antes de
// llamar aquí, y se manda después de responder (afterResponse). Si el envío
// falla, se avisa al administrador con el folio para reponerlo a mano.
import type { Env } from "../env";
import type { Session } from "./db";
import {
  ADMIN_EMAIL,
  escapeHtml,
  fmtFechaCompletaCDMX,
  fmtHoraCDMX,
  fmtHoraExactaCDMX,
  fmtMomentoCDMX,
  fmtPesos,
  fmtTiempo,
  folioDe,
  renderShell,
  renderText,
  sendEmail,
  sendEmails,
  type Detail,
  type Mail,
} from "./email";

export type TipoRecibo = "entrada" | "propina" | "despedida" | "destacado" | "membresia";

// Liga firmada al recibo en PDF: quien tiene el correo puede descargarlo sin
// pedirle que inicie sesión (como un recibo de verdad). La firma sale del id
// y del secreto de sesión; sin ella, hace falta ser una de las dos partes.
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function firmaRecibo(secret: string, id: string): Promise<string> {
  return (await hmacHex(secret, `recibo:${id}`)).slice(0, 24);
}
export async function urlRecibo(env: Env, id: string): Promise<string> {
  return `${env.APP_URL}/recibo/${encodeURIComponent(id)}?t=${await firmaRecibo(env.SESSION_SECRET, id)}`;
}

export interface EventoDinero {
  tipo: TipoRecibo;
  /** id del pase / propina / membresía: de aquí sale el folio. */
  id: string;
  /** El segundo exacto del cobro (unix). */
  at: number;
  /** Lo que pagó quien ve. */
  amountCents: number;
  /** Lo que se queda quien transmite. La diferencia es la comisión. */
  creatorCents: number;
  appUrl: string;
  room: { slug: string; title: string };
  viewer: { name: string; email: string; avatarUrl: string | null; balanceAfterCents: number };
  creator: { name: string; email: string; avatarUrl: string | null; creatorBalanceAfterCents: number };
  /** La transmisión en la que ocurrió (null si fue fuera de transmisión). */
  session: { startedAt: number; endedAt: number | null } | null;
  /** Mensaje de la propina o texto del destacado. */
  message?: string | null;
  /** Entrada: fin de la hora. Membresía: fin del mes. Destacado: fin de los 3 min. */
  expiresAt?: number | null;
  /** Liga firmada al recibo en PDF (el objeto para guardar). */
  pdfUrl?: string | null;
}

const TITULO: Record<TipoRecibo, string> = {
  entrada: "Entrada",
  propina: "Propina",
  despedida: "Propina de despedida",
  destacado: "Mensaje destacado",
  membresia: "Membresía mensual",
};

/** "Minuto 12:34 de la transmisión", "5 minutos después de que terminó la
 *  transmisión" o "Fuera de transmisión". El mismo texto va a las dos partes. */
export function momentoEnTransmision(ev: Pick<EventoDinero, "at" | "session">): string {
  if (!ev.session) return "Fuera de transmisión";
  const { startedAt, endedAt } = ev.session;
  if (endedAt !== null && ev.at > endedAt) {
    const min = Math.max(1, Math.round((ev.at - endedAt) / 60));
    return `${min} ${min === 1 ? "minuto" : "minutos"} después de que terminó la transmisión`;
  }
  const t = Math.max(0, ev.at - startedAt);
  return `Minuto ${fmtTiempo(t)} de la transmisión`;
}

function transmisionLinea(ev: EventoDinero): string {
  if (!ev.session) return ev.room.title;
  return `${ev.room.title} · empezó ${fmtHoraCDMX(ev.session.startedAt)} del ${fmtFechaCompletaCDMX(ev.session.startedAt)}`;
}

function comun(ev: EventoDinero): Detail[] {
  return [
    { label: "Folio", value: folioDe(ev.id), strong: true },
    { label: "Fecha y hora exacta", value: fmtMomentoCDMX(ev.at) },
    { label: "Momento", value: momentoEnTransmision(ev) },
    { label: "Transmisión", value: transmisionLinea(ev) },
  ];
}

function mxn(cents: number): string {
  return `${fmtPesos(cents)} MXN`;
}

/** Los dos recibos de un mismo evento, con el mismo folio. */
export function recibosDe(ev: EventoDinero): { viewer: Mail; creator: Mail } {
  const folio = folioDe(ev.id);
  const fee = ev.amountCents - ev.creatorCents;
  const roomUrl = `${ev.appUrl}/${encodeURIComponent(ev.room.slug)}`;
  const txUrl = `${ev.appUrl}/app/transacciones`;
  const msg = (ev.message ?? "").trim();
  const pdf = ev.pdfUrl
    ? ` <a href="${escapeHtml(ev.pdfUrl)}" style="color:#1f9d5c; font-weight:700; text-decoration:underline;">Descarga el recibo en PDF</a>: con la hora exacta en grande y las dos fotos, para guardarlo.`
    : "";
  const sello = (otro: string) =>
    `Este mismo folio <strong>${escapeHtml(folio)}</strong> le llegó a <strong>${escapeHtml(otro)}</strong> en su recibo, en este mismo segundo. Para los dos quedó constancia de que estuvieron ahí.${pdf}`;
  const selloTexto = (otro: string) => `Este mismo folio ${folio} le llegó a ${otro} en su recibo, en este mismo segundo.${ev.pdfUrl ? ` Recibo en PDF: ${ev.pdfUrl}` : ""}`;

  // ---------- quien ve ----------
  let vBadge: string, vHeadline: string, vBody: string, vSubject: string, vCta = "Volver a la sala";
  const vStats = [
    { value: fmtPesos(ev.amountCents), label: "pagaste (MXN)" },
    { value: fmtPesos(ev.creatorCents), label: `para ${ev.creator.name}`, green: true },
  ];
  const vDetails: Detail[] = [...comun(ev)];
  switch (ev.tipo) {
    case "entrada":
      vBadge = "🎟️ Tu entrada";
      vHeadline = `Entraste a la sala de ${ev.creator.name}`;
      vBody = `Este es tu recibo. Tu hora corre desde el segundo en que cruzaste la puerta; si la sala sigue abierta cuando se acabe, renuevas con un toque.`;
      vSubject = `🎟️ Tu entrada a la sala de ${ev.creator.name} — ${mxn(ev.amountCents)} · ${folio}`;
      if (ev.expiresAt) vStats.push({ value: fmtHoraCDMX(ev.expiresAt), label: "termina tu hora" });
      break;
    case "propina":
      vBadge = "💵 Tu propina";
      vHeadline = `Le mandaste ${fmtPesos(ev.amountCents)} a ${ev.creator.name}`;
      vBody = `Este es tu recibo. ${ev.creator.name} lo vio caer en vivo, con tu nombre, en el segundo en que lo mandaste.`;
      vSubject = `💵 Le mandaste ${mxn(ev.amountCents)} a ${ev.creator.name} · ${folio}`;
      break;
    case "despedida":
      vBadge = "💵 Tu propina de despedida";
      vHeadline = `Le dejaste ${fmtPesos(ev.amountCents)} a ${ev.creator.name} al despedirte`;
      vBody = `Este es tu recibo. La transmisión ya había terminado y aun así quisiste agradecer: eso llega, y queda registrado.`;
      vSubject = `💵 Tu propina de despedida para ${ev.creator.name} — ${mxn(ev.amountCents)} · ${folio}`;
      break;
    case "destacado":
      vBadge = "⭐ Tu mensaje destacado";
      vHeadline = `Tu mensaje se destacó en la sala de ${ev.creator.name}`;
      vBody = `Este es tu recibo. Tu mensaje quedó fijado arriba del chat, en dorado y con el monto a la vista, durante 3 minutos.`;
      vSubject = `⭐ Tu mensaje destacado en la sala de ${ev.creator.name} — ${mxn(ev.amountCents)} · ${folio}`;
      if (ev.expiresAt) vDetails.push({ label: "En pantalla hasta", value: `${fmtHoraExactaCDMX(ev.expiresAt)}, hora de Ciudad de México` });
      break;
    case "membresia":
      vBadge = "🪪 Tu membresía";
      vHeadline = `Eres miembro de la sala de ${ev.creator.name}`;
      vBody = `Este es tu recibo. Entras todas las veces que quieras durante 30 días sin pagar la hora.`;
      vSubject = `🪪 Tu membresía en la sala de ${ev.creator.name} — ${mxn(ev.amountCents)} · ${folio}`;
      vCta = "Ir a la sala";
      if (ev.expiresAt) vStats.push({ value: fmtFechaCompletaCDMX(ev.expiresAt), label: "válida hasta" });
      break;
  }
  if (msg) vDetails.push({ label: "Tu mensaje", value: `“${msg}”` });
  vDetails.push({ label: "Comisión de Video Room", value: mxn(fee) });
  vDetails.push({ label: "Saldo que te queda", value: mxn(ev.viewer.balanceAfterCents) });
  vDetails.push({ label: "Grabación", value: "Ninguna — nada queda guardado" });

  const viewer: Mail = {
    subject: vSubject,
    html: renderShell({
      appUrl: ev.appUrl,
      preheader: `${TITULO[ev.tipo]} · ${mxn(ev.amountCents)} · folio ${folio} · ${fmtMomentoCDMX(ev.at)}`,
      badgeText: vBadge,
      avatarUrl: ev.creator.avatarUrl,
      avatarAlt: ev.creator.name,
      headline: vHeadline,
      bodyHtml: escapeHtml(vBody),
      stats: vStats,
      details: vDetails,
      ctaLabel: vCta,
      linkUrl: roomUrl,
      afterHtml: sello(ev.creator.name),
      fineprint: "Cada peso que pagas queda en tu historial para siempre, en Transacciones. Si algo de este recibo no coincide con lo que viste, responde este correo con el folio.",
    }),
    text: renderText({
      headline: vSubject,
      lines: [vBody, "", selloTexto(ev.creator.name)],
      details: [...vDetails.filter((d) => d.label !== "Grabación"), { label: "Pagaste", value: mxn(ev.amountCents) }, { label: `Para ${ev.creator.name}`, value: mxn(ev.creatorCents) }],
      ctaLabel: vCta,
      linkUrl: roomUrl,
    }),
  };

  // ---------- quien transmite ----------
  let cBadge: string, cHeadline: string, cBody: string, cSubject: string;
  const mas = `+${fmtPesos(ev.creatorCents)}`;
  switch (ev.tipo) {
    case "entrada":
      cBadge = "💵 Entrada cobrada";
      cHeadline = `${ev.viewer.name} entró a tu sala: ${mas}`;
      cBody = `Pagó su hora y cruzó la puerta. Tu parte ya está en tu balance de creador, desde el mismo segundo.`;
      cSubject = `💵 ${ev.viewer.name} entró a tu sala — ${mas} MXN para ti · ${folio}`;
      break;
    case "propina":
      cBadge = "💵 Propina recibida";
      cHeadline = `${ev.viewer.name} te mandó ${fmtPesos(ev.amountCents)}: ${mas} para ti`;
      cBody = `Una propina en vivo. Tu parte ya está en tu balance de creador.`;
      cSubject = `💵 ${ev.viewer.name} te mandó ${mxn(ev.amountCents)} — ${mas} para ti · ${folio}`;
      break;
    case "despedida":
      cBadge = "💵 Propina de despedida";
      cHeadline = `${ev.viewer.name} te dejó ${fmtPesos(ev.amountCents)} al despedirse: ${mas} para ti`;
      cBody = `La transmisión ya había terminado y aun así quiso agradecer. Tu parte ya está en tu balance de creador.`;
      cSubject = `💵 ${ev.viewer.name} te dejó una propina de despedida — ${mas} para ti · ${folio}`;
      break;
    case "destacado":
      cBadge = "⭐ Mensaje destacado pagado";
      cHeadline = `${ev.viewer.name} destacó un mensaje por ${fmtPesos(ev.amountCents)}: ${mas} para ti`;
      cBody = `Su mensaje quedó fijado arriba del chat durante 3 minutos. Tu parte ya está en tu balance de creador.`;
      cSubject = `⭐ ${ev.viewer.name} destacó un mensaje — ${mas} para ti · ${folio}`;
      break;
    case "membresia":
      cBadge = "🪪 Membresía vendida";
      cHeadline = `${ev.viewer.name} compró tu membresía mensual: ${mas} para ti`;
      cBody = `Entrará a tu sala todas las veces que quiera durante 30 días. Tu parte ya está en tu balance de creador.`;
      cSubject = `🪪 ${ev.viewer.name} compró tu membresía — ${mas} para ti · ${folio}`;
      break;
  }
  const cDetails: Detail[] = [...comun(ev), { label: "Quién", value: ev.viewer.name }];
  if (msg) cDetails.push({ label: "Su mensaje", value: `“${msg}”` });
  if (ev.tipo === "entrada" && ev.expiresAt) cDetails.push({ label: "Su hora termina", value: `${fmtHoraCDMX(ev.expiresAt)}, hora de Ciudad de México` });
  if (ev.tipo === "membresia" && ev.expiresAt) cDetails.push({ label: "Su membresía vale hasta", value: fmtFechaCompletaCDMX(ev.expiresAt) });
  cDetails.push({ label: "Tu balance de creador ahora", value: mxn(ev.creator.creatorBalanceAfterCents), strong: true });

  const creator: Mail = {
    subject: cSubject,
    html: renderShell({
      appUrl: ev.appUrl,
      preheader: `${mas} MXN para ti · ${TITULO[ev.tipo].toLowerCase()} de ${ev.viewer.name} · folio ${folio}`,
      badgeText: cBadge,
      avatarUrl: ev.viewer.avatarUrl,
      avatarAlt: ev.viewer.name,
      headline: cHeadline,
      bodyHtml: escapeHtml(cBody),
      stats: [
        { value: fmtPesos(ev.creatorCents), label: "para ti (MXN)", green: true },
        { value: fmtPesos(ev.amountCents), label: "pagó" },
        { value: fmtPesos(fee), label: "comisión Video Room" },
      ],
      details: cDetails,
      ctaLabel: "Ver mis transacciones",
      linkUrl: txUrl,
      afterHtml: sello(ev.viewer.name),
      fineprint: "Lo tuyo ya está en tu balance de creador, listo para retirar desde $10.00 MXN. Cada movimiento queda guardado para siempre en Transacciones.",
    }),
    text: renderText({
      headline: cSubject,
      lines: [cBody, "", selloTexto(ev.viewer.name)],
      details: [...cDetails, { label: "Pagó", value: mxn(ev.amountCents) }, { label: "Para ti", value: mxn(ev.creatorCents) }, { label: "Comisión de Video Room", value: mxn(fee) }],
      ctaLabel: "Ver mis transacciones",
      linkUrl: txUrl,
    }),
  };

  return { viewer, creator };
}

/** Lo que las rutas saben al momento del cobro; el resto (datos frescos del
 *  creador, la transmisión si no la traen) se completa aquí, ya fuera del
 *  camino de la respuesta. */
export interface EventoDineroRuta {
  tipo: TipoRecibo;
  id: string;
  at: number;
  amountCents: number;
  creatorCents: number;
  room: { id: string; slug: string; title: string; owner_id: string };
  viewer: { name: string; email: string; avatarUrl: string | null; balanceAfterCents: number };
  /** Si viene, se usa; si viene undefined, se busca la sesión en vivo de la sala. */
  session?: Pick<Session, "started_at" | "ended_at"> | null;
  message?: string | null;
  expiresAt?: number | null;
}

export async function enviarRecibos(env: Env, e: EventoDineroRuta): Promise<void> {
  const folio = folioDe(e.id);
  try {
    const [owner, session] = await Promise.all([
      env.DB.prepare("SELECT name, email, avatar_url, creator_balance_cents FROM users WHERE id = ?")
        .bind(e.room.owner_id)
        .first<{ name: string; email: string; avatar_url: string | null; creator_balance_cents: number }>(),
      e.session === undefined
        ? env.DB.prepare("SELECT started_at, ended_at FROM sessions WHERE room_id = ? AND status = 'live'").bind(e.room.id).first<Pick<Session, "started_at" | "ended_at">>()
        : Promise.resolve(e.session),
    ]);
    if (!owner) throw new Error(`creador ${e.room.owner_id} no existe`);
    const ev: EventoDinero = {
      tipo: e.tipo,
      id: e.id,
      at: e.at,
      amountCents: e.amountCents,
      creatorCents: e.creatorCents,
      appUrl: env.APP_URL,
      room: { slug: e.room.slug, title: e.room.title },
      viewer: e.viewer,
      creator: { name: owner.name, email: owner.email, avatarUrl: owner.avatar_url, creatorBalanceAfterCents: owner.creator_balance_cents },
      session: session ? { startedAt: session.started_at, endedAt: session.ended_at } : null,
      message: e.message ?? null,
      expiresAt: e.expiresAt ?? null,
      pdfUrl: await urlRecibo(env, e.id),
    };
    const { viewer, creator } = recibosDe(ev);
    const ok = await sendEmails(env.RESEND_API_KEY, [
      { to: ev.viewer.email, ...viewer },
      { to: ev.creator.email, ...creator },
    ]);
    if (!ok) throw new Error("Resend no aceptó el envío");
  } catch (err) {
    console.error("recibos", folio, err);
    await sendEmail(env.RESEND_API_KEY, {
      to: ADMIN_EMAIL,
      subject: `🔴 No salió el recibo ${folio} (${e.tipo})`,
      html: `<pre style="white-space:pre-wrap; font-family:monospace;">${escapeHtml(JSON.stringify({ ...e, error: String((err as Error)?.stack || err) }, null, 2))}</pre>`,
      text: JSON.stringify({ ...e, error: String((err as Error)?.stack || err) }, null, 2),
    }).catch(() => {});
  }
}
