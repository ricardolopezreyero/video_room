// RLR
// Todos los correos de Video Room salen de aquí. Una sola plantilla
// (renderShell) con piezas opcionales —foto, cifras grandes, renglones de
// recibo, botón— para que cada aviso se sienta hecho a mano y, aun así,
// todos se vean de la misma familia. Regla de la casa: cada correo trae UNA
// acción clara (botón + el mismo link en texto para copiar/reenviar).
const RESEND_API = "https://api.resend.com/emails";
// Sale desde el dominio raíz (verificado en Resend). El plan actual de Resend
// está al tope de dominios, así que video.capitaltorreon.com no se pudo
// verificar aparte — cuando se amplíe el plan o se libere un dominio, basta
// con cambiar esta línea a hola@video.capitaltorreon.com.
const FROM = "Video Room <hola@capitaltorreon.com>";
/** A quién se avisa cuando algo falla por dentro (errores, correos que no salieron). */
export const ADMIN_EMAIL = "Ricardo@superleads.mx";

// Dominios reservados para pruebas: a esas direcciones nunca se manda nada.
// Un correo a "@test.local" rebota, y cada rebote le resta reputación al
// dominio real desde el que escribimos. Las pruebas (vitest) crean usuarios
// con esos dominios a propósito.
const DOMINIOS_DE_PRUEBA = /@([^@]+\.)?(test|local|invalid|example)(\.com|\.org|\.net)?$/i;
export function sePuedeEnviar(apiKey: string, to: string): boolean {
  if (!apiKey || !apiKey.startsWith("re_")) return false;
  return !DOMINIOS_DE_PRUEBA.test(to.trim());
}

export async function sendEmail(
  apiKey: string,
  params: { to: string; subject: string; html: string; text: string; unsubscribeUrl?: string }
): Promise<boolean> {
  if (!sePuedeEnviar(apiKey, params.to)) return false;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        // List-Unsubscribe + "One-Click" hacen que Gmail/Outlook muestren su
        // propio botón de "Cancelar suscripción" junto al remitente — mejora
        // la entregabilidad porque la gente deja de reportar el correo como spam.
        ...(params.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Varios correos en una sola llamada (lote de Resend). Si el lote falla, se
 *  mandan uno por uno: que un correo nunca se pierda por culpa del otro. */
export async function sendEmails(
  apiKey: string,
  mails: { to: string; subject: string; html: string; text: string }[]
): Promise<boolean> {
  const reales = mails.filter((m) => sePuedeEnviar(apiKey, m.to));
  if (reales.length !== mails.length) return false;
  try {
    const res = await fetch(`${RESEND_API}/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(mails.map((m) => ({ from: FROM, to: m.to, subject: m.subject, html: m.html, text: m.text }))),
    });
    if (res.ok) return true;
    console.error("resend batch", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("resend batch", err);
  }
  const results = await Promise.all(mails.map((m) => sendEmail(apiKey, m)));
  return results.every(Boolean);
}

export function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    // Algunos proveedores transcodifican a quoted-printable y rompen un "="
    // seguido de dos hex (lo confunden con "=3D"), corrompiendo URLs con
    // query params. &#61; se decodifica a "=" en cualquier cliente.
    .replace(/=/g, "&#61;");
}

/** "$1,920" — pesos sin centavos; es como se habla de dinero en toda la app. */
export function fmtMXN(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("es-MX")}`;
}

/** Hora CDMX "4:35 p.m." — México ya no usa horario de verano (UTC-6 fijo). */
export function fmtHoraCDMX(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "$37.50" — con centavos exactos. Para recibos y todo lo que sea dinero
 *  cobrado: ahí un redondeo es un error. */
export function fmtPesos(cents: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** "11:58:07 a.m." — con segundos. */
export function fmtHoraExactaCDMX(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "4 de octubre de 2026" */
export function fmtFechaCompletaCDMX(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "sábado, 4 de octubre de 2026 · 11:58:07 a.m., hora de Ciudad de México" —
 *  el segundo exacto en que pasó, dicho completo. */
export function fmtMomentoCDMX(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const fecha = d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${fecha} · ${fmtHoraExactaCDMX(unixSeconds)}, hora de Ciudad de México`;
}

/** 754 → "12:34"; 3725 → "1:02:05" */
export function fmtTiempo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** Folio legible y estable a partir del id interno: "pass_cf7064a0…" →
 *  "VR-CF70-64A0-7428". Mismo id, mismo folio, en los dos correos y en la
 *  base; con él se encuentra el movimiento exacto. Para referencias de
 *  Stripe ("tr_1Qx8…") se toma lo que va después del último guion bajo. */
export function folioDe(id: string): string {
  const cuerpo = id.slice(id.lastIndexOf("_") + 1).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().padEnd(12, "0").slice(0, 12);
  return `VR-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`;
}

export function fmtFechaCDMX(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "long",
  });
}

export function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

interface Stat {
  value: string;
  label: string;
  green?: boolean;
}
export interface Detail {
  label: string;
  value: string;
  strong?: boolean;
}
interface ShellOpts {
  appUrl: string;
  preheader: string;
  badgeText: string;
  /** Verde por defecto; "red" para fallos, "gold" para hitos. */
  tone?: "green" | "red" | "gold";
  avatarUrl: string | null;
  avatarAlt: string;
  headline: string;
  /** HTML ya escapado donde haga falta. */
  bodyHtml: string;
  stats?: Stat[];
  details?: Detail[];
  ctaLabel: string;
  linkUrl: string;
  /** Texto corto debajo del botón (HTML ya escapado). */
  afterHtml?: string;
  fineprint?: string;
  unsubscribeUrl?: string;
}

const TONES = {
  green: { badgeBg: "rgba(86,239,159,.14)", badgeFg: "#1f9d5c", ring: "#56EF9F", btnBg: "#56EF9F", btnFg: "#0D1117" },
  red: { badgeBg: "rgba(229,72,77,.12)", badgeFg: "#c93a3f", ring: "#E5484D", btnBg: "#0D1117", btnFg: "#ffffff" },
  gold: { badgeBg: "rgba(245,197,66,.16)", badgeFg: "#9a6f00", ring: "#F5C542", btnBg: "#56EF9F", btnFg: "#0D1117" },
};

// Tablas, estilos en línea y nada de flex/grid: es lo único que pintan igual
// Gmail, Outlook y Apple Mail. El ancho de 600px con el bloque de 32px de
// margen lateral se ve bien en celular sin media queries.
export function renderShell(o: ShellOpts): string {
  const t = TONES[o.tone ?? "green"];
  const host = o.appUrl.replace(/^https?:\/\//, "");
  const avatar = o.avatarUrl
    ? `<img src="${escapeHtml(o.avatarUrl)}" width="72" height="72" alt="${escapeHtml(o.avatarAlt)}"
         style="width:72px; height:72px; border-radius:50%; border:3px solid ${t.ring}; display:block; object-fit:cover; background:#0D1117;">`
    : "";

  const statsHtml = o.stats && o.stats.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px; border-collapse:separate; border-spacing:8px 0;">
        <tr>${o.stats
          .map(
            (s) => `<td width="${Math.floor(100 / o.stats!.length)}%" valign="top" style="background:#f3f5f8; border:1px solid #e6e9ef; border-radius:12px; padding:14px 12px; text-align:center;">
              <div style="font-size:24px; line-height:1.1; font-weight:800; letter-spacing:-.5px; color:${s.green ? "#1f9d5c" : "#0D1117"};">${escapeHtml(s.value)}</div>
              <div style="font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:#7c8696; margin-top:6px;">${escapeHtml(s.label)}</div>
            </td>`
          )
          .join("")}</tr>
      </table>`
    : "";

  const detailsHtml = o.details && o.details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px; border:1px solid #e6e9ef; border-radius:12px; border-collapse:separate; overflow:hidden;">
        ${o.details
          .map(
            (d, i) => `<tr>
              <td style="padding:12px 16px; font-size:13px; color:#7c8696; ${i ? "border-top:1px solid #eef1f5;" : ""}">${escapeHtml(d.label)}</td>
              <td align="right" style="padding:12px 16px; font-size:14px; font-weight:${d.strong ? "800" : "600"}; color:#0D1117; ${i ? "border-top:1px solid #eef1f5;" : ""}">${escapeHtml(d.value)}</td>
            </tr>`
          )
          .join("")}
      </table>`
    : "";

  const footerText = o.unsubscribeUrl
    ? `Recibes este correo porque pediste que te avisáramos sobre esta sala en Video Room.
       <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:#7c8696; text-decoration:underline;">Dejar de recibir avisos de esta sala</a>.`
    : `Este correo es un recibo de tu actividad en <a href="${escapeHtml(o.appUrl)}" style="color:#7c8696; text-decoration:underline;">Video Room</a>. Nada se graba, nada se borra de tu historial.`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(o.headline)}</title>
</head>
<body style="margin:0; padding:0; background:#eef1f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(o.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5; padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 8px 30px rgba(13,17,23,.08);">
          <tr>
            <td style="background:#0D1117; padding:20px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:17px; font-weight:800; letter-spacing:-.3px;">
                  <a href="${escapeHtml(o.appUrl)}" style="text-decoration:none; color:#ffffff;">Video<span style="color:#56EF9F;">Room</span></a>
                </td>
                <td align="right" style="font-size:11px; font-weight:700; letter-spacing:.4px; color:rgba(255,255,255,.45); text-transform:uppercase;">${escapeHtml(host)}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;"><tr>
                ${avatar ? `<td valign="middle" style="padding-right:16px;">${avatar}</td>` : ""}
                <td valign="middle">
                  <div style="display:inline-block; background:${t.badgeBg}; color:${t.badgeFg}; font-size:11px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; padding:5px 12px; border-radius:20px; margin-bottom:10px;">${escapeHtml(o.badgeText)}</div>
                  <h1 style="margin:0; font-size:24px; line-height:1.25; color:#0D1117; font-weight:800; letter-spacing:-.4px;">${escapeHtml(o.headline)}</h1>
                </td>
              </tr></table>
              <p style="margin:0 0 22px; font-size:15.5px; line-height:1.65; color:#44505f;">${o.bodyHtml}</p>
              ${statsHtml}
              ${detailsHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr>
                <td style="border-radius:12px; background:${t.btnBg};">
                  <a href="${escapeHtml(o.linkUrl)}" style="display:inline-block; padding:15px 28px; font-size:15px; font-weight:800; color:${t.btnFg}; text-decoration:none; letter-spacing:-.1px;">${escapeHtml(o.ctaLabel)} →</a>
                </td>
              </tr></table>
              ${o.afterHtml ? `<p style="margin:0 0 18px; font-size:13.5px; line-height:1.6; color:#5b6678;">${o.afterHtml}</p>` : ""}
              <p style="margin:0 0 6px; font-size:11px; font-weight:800; letter-spacing:.4px; text-transform:uppercase; color:#9aa5b8;">O copia este link</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8; border:1px solid #e6e9ef; border-radius:10px;"><tr>
                <td style="padding:12px 16px; font-size:14px; font-weight:700; color:#1f9d5c; word-break:break-all;">
                  <a href="${escapeHtml(o.linkUrl)}" style="color:#1f9d5c; text-decoration:none;">${escapeHtml(o.linkUrl.replace(/^https?:\/\//, ""))}</a>
                </td>
              </tr></table>
              ${o.fineprint ? `<p style="margin:22px 0 0; font-size:12.5px; line-height:1.6; color:#8a94a6;">${escapeHtml(o.fineprint)}</p>` : ""}
              <div style="height:28px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background:#f8f9fb; border-top:1px solid #e6e9ef;">
              <p style="margin:0; font-size:11.5px; color:#8a94a6; line-height:1.6;">${footerText}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0; font-size:11px; color:#9aa5b8;">Video Room · ${escapeHtml(host)}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versión en texto plano: mismo contenido, misma acción, para clientes sin HTML. */
export function renderText(o: {
  headline: string;
  lines: string[];
  details?: Detail[];
  ctaLabel: string;
  linkUrl: string;
  fineprint?: string;
  unsubscribeUrl?: string;
}): string {
  const parts = [o.headline, "", ...o.lines];
  if (o.details?.length) {
    parts.push("", ...o.details.map((d) => `${d.label}: ${d.value}`));
  }
  parts.push("", `${o.ctaLabel}: ${o.linkUrl}`);
  if (o.fineprint) parts.push("", o.fineprint);
  if (o.unsubscribeUrl) parts.push("", `Dejar de recibir avisos de esta sala: ${o.unsubscribeUrl}`);
  parts.push("", "— Video Room");
  return parts.join("\n");
}

export type Mail = { subject: string; html: string; text: string };

// ---------------------------------------------------------------------------
// Avisos a seguidores
// ---------------------------------------------------------------------------

export function liveNotificationEmail(opts: {
  appUrl: string;
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  unsubscribeUrl: string;
}): Mail {
  const { appUrl, creatorName, creatorAvatar, roomTitle, roomUrl, unsubscribeUrl } = opts;
  const subject = `🔴 ${creatorName} ya está en vivo`;
  const html = renderShell({
    appUrl,
    preheader: `${creatorName} está transmitiendo ahora mismo — entra antes de que se acabe.`,
    badgeText: "🔴 En vivo ahora",
    avatarUrl: creatorAvatar,
    avatarAlt: creatorName,
    headline: `${creatorName} ya está en vivo`,
    bodyHtml: `Pediste que te avisáramos en cuanto <strong>${escapeHtml(roomTitle)}</strong> abriera su sala. Ya está transmitiendo — entra ahora, mientras sigue en vivo.`,
    details: [
      { label: "Precio", value: "$20 MXN por hora" },
      { label: "Grabación", value: "Ninguna — en vivo y se borra" },
    ],
    ctaLabel: "Entrar a la sala",
    linkUrl: roomUrl,
    fineprint: "Puedes salir cuando quieras. Tu hora empieza en el momento en que cruzas la puerta.",
    unsubscribeUrl,
  });
  const text = renderText({
    headline: subject,
    lines: [`Pediste que te avisáramos cuando ${roomTitle} abriera su sala. Ya está transmitiendo.`, "$20 MXN por hora · nada se graba."],
    ctaLabel: "Entrar a la sala",
    linkUrl: roomUrl,
    unsubscribeUrl,
  });
  return { subject, html, text };
}

export function startingSoonEmail(opts: {
  appUrl: string;
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  minutes: number;
  unsubscribeUrl: string;
}): Mail {
  const { appUrl, creatorName, creatorAvatar, roomTitle, roomUrl, minutes, unsubscribeUrl } = opts;
  const when = minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} ${plural(minutes / 60, "hora", "horas")}` : `${minutes} minutos`;
  const subject = `⏰ ${creatorName} empieza en ${when}`;
  const html = renderShell({
    appUrl,
    preheader: `${creatorName} entra en vivo en ${when} — aparta tu lugar.`,
    badgeText: `⏰ Empieza en ${when}`,
    tone: "gold",
    avatarUrl: creatorAvatar,
    avatarAlt: creatorName,
    headline: `${creatorName} empieza en ${when}`,
    bodyHtml: `Pediste que te avisáramos sobre <strong>${escapeHtml(roomTitle)}</strong>. Está a punto de transmitir — deja la sala abierta y entra a tiempo.`,
    ctaLabel: "Ir a la sala",
    linkUrl: roomUrl,
    fineprint: "$20 MXN por hora · nada se graba · puedes salir cuando quieras.",
    unsubscribeUrl,
  });
  const text = renderText({
    headline: subject,
    lines: [`Pediste que te avisáramos sobre ${roomTitle}. Está a punto de transmitir.`, "$20 MXN por hora · nada se graba."],
    ctaLabel: "Ir a la sala",
    linkUrl: roomUrl,
    unsubscribeUrl,
  });
  return { subject, html, text };
}

// Copia de confirmación para el creador: le llega siempre que dispara un
// aviso, tenga o no seguidores esperando, para que compruebe que salió.
export function creatorNotifyConfirmationEmail(opts: {
  appUrl: string;
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  followerCount: number;
  kind: "live" | "starting_soon";
  minutes?: number;
}): Mail {
  const { appUrl, creatorName, creatorAvatar, roomTitle, roomUrl, followerCount, kind, minutes } = opts;
  const when = kind === "starting_soon" && minutes
    ? minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} ${plural(minutes / 60, "hora", "horas")}` : `${minutes} minutos`
    : null;
  const headline = kind === "live" ? "Ya avisamos que estás en vivo" : `Ya avisamos que empiezas en ${when}`;
  const subject = `✅ ${headline}`;
  const bodyHtml = followerCount > 0
    ? `Le mandamos este aviso a <strong>${followerCount} ${plural(followerCount, "persona", "personas")}</strong> que ${plural(followerCount, "pidió", "pidieron")} que le avisaras sobre <strong>${escapeHtml(roomTitle)}</strong>. Esta copia es para que confirmes que el envío salió.`
    : `Todavía nadie te ha pedido que le avises sobre <strong>${escapeHtml(roomTitle)}</strong>, así que este aviso no salió a nadie más — pero así se ve cuando sí tengas gente esperando. Esta copia confirma que el botón funciona.`;
  const html = renderShell({
    appUrl,
    preheader: headline,
    badgeText: kind === "live" ? "🔴 En vivo ahora" : `⏰ Empieza en ${when}`,
    avatarUrl: creatorAvatar,
    avatarAlt: creatorName,
    headline,
    bodyHtml,
    stats: [
      { value: String(followerCount), label: plural(followerCount, "persona avisada", "personas avisadas"), green: followerCount > 0 },
    ],
    ctaLabel: followerCount > 0 ? "Ver tu sala" : "Copiar mi link y compartirlo",
    linkUrl: followerCount > 0 ? roomUrl : `${appUrl}/app/monedero`,
    afterHtml: followerCount > 0 ? undefined : "Entre más gente active «Avísame cuando abra» en tu sala, más llena empieza cada transmisión.",
    fineprint: "Esta copia solo te llega a ti.",
  });
  const text = renderText({
    headline,
    lines: [followerCount > 0 ? `Se mandó a ${followerCount} persona(s).` : "Nadie más lo recibió todavía porque no tienes seguidores esperando."],
    ctaLabel: "Ver tu sala",
    linkUrl: roomUrl,
  });
  return { subject, html, text };
}

// Alguien nuevo pidió que le avisen: es la señal más temprana de demanda que
// tiene un creador, y motiva a programar la siguiente transmisión.
export function newFollowerEmail(opts: {
  appUrl: string;
  creatorName: string;
  creatorAvatar: string | null;
  followerName: string;
  followerAvatar: string | null;
  followerCount: number;
  roomUrl: string;
}): Mail {
  const { appUrl, creatorName, creatorAvatar, followerName, followerAvatar, followerCount, roomUrl } = opts;
  const subject = `🔔 ${followerName} quiere que le avises cuando abras`;
  const monederoUrl = `${appUrl}/app/monedero`;
  const html = renderShell({
    appUrl,
    preheader: `${followerName} activó «Avísame cuando abra» en tu sala. Ya son ${followerCount}.`,
    badgeText: "🔔 Nueva persona esperando",
    avatarUrl: followerAvatar ?? creatorAvatar,
    avatarAlt: followerAvatar ? followerName : creatorName,
    headline: `${followerName} quiere que le avises cuando abras`,
    bodyHtml: `Acaba de activar <strong>«Avísame cuando abra»</strong> en tu sala. Cuando empieces a transmitir le llegará un correo al instante — y si quieres calentar motores, puedes avisarle desde ahora que empiezas en unos minutos.`,
    stats: [
      { value: String(followerCount), label: plural(followerCount, "persona esperando", "personas esperando"), green: true },
    ],
    ctaLabel: "Avisar que empiezo",
    linkUrl: monederoUrl,
    afterHtml: `Tu sala: <a href="${escapeHtml(roomUrl)}" style="color:#1f9d5c; font-weight:700; text-decoration:none;">${escapeHtml(roomUrl.replace(/^https?:\/\//, ""))}</a>`,
  });
  const text = renderText({
    headline: subject,
    lines: [`Activó «Avísame cuando abra» en tu sala. Ya son ${followerCount} persona(s) esperando.`],
    ctaLabel: "Avisar que empiezo",
    linkUrl: monederoUrl,
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Cuenta y dinero
// ---------------------------------------------------------------------------

// Primer correo de la vida de un creador: su sala ya existe y tiene link.
export function welcomeEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  roomUrl: string;
}): Mail {
  const { appUrl, name, avatarUrl, roomUrl } = opts;
  const first = name.split(" ")[0] || name;
  const subject = `🎉 Tu sala ya existe, ${first}`;
  const html = renderShell({
    appUrl,
    preheader: `Tu link es ${roomUrl.replace(/^https?:\/\//, "")}. Compártelo, transmite, cobra.`,
    badgeText: "🎉 Bienvenido a Video Room",
    avatarUrl,
    avatarAlt: name,
    headline: `Tu sala ya existe, ${first}`,
    bodyHtml: `Ya tienes una sala de video en vivo con puerta de cobro, lista para usarse. No hay nada que configurar: <strong>comparte tu link, prende la cámara y cada persona que entre te paga</strong>.`,
    details: [
      { label: "Tu link", value: roomUrl.replace(/^https?:\/\//, ""), strong: true },
      { label: "Cada persona paga", value: "$20 MXN por hora" },
      { label: "Tú te quedas con", value: "$16 de cada entrada de $20, y el 100% de lo que te manden adentro" },
      { label: "Grabación", value: "Ninguna, nunca" },
    ],
    ctaLabel: "Abrir mi sala",
    linkUrl: roomUrl,
    afterHtml: "Pega tu link donde ya está tu gente —WhatsApp, Instagram, tu bio— y deja que la gente active «Avísame cuando abra». Cuando transmitas, les avisamos nosotros.",
    fineprint: "Tu primer retiro puede ser desde $10 MXN, directo a tu banco, para que compruebes que el dinero de verdad llega.",
  });
  const text = renderText({
    headline: subject,
    lines: ["Ya tienes una sala de video en vivo con puerta de cobro. Comparte tu link, prende la cámara y cada persona que entre te paga."],
    details: [
      { label: "Tu link", value: roomUrl },
      { label: "Cada persona paga", value: "$20 MXN por hora" },
      { label: "Tú te quedas con", value: "$16 de cada entrada de $20, y el 100% de lo que te manden adentro" },
    ],
    ctaLabel: "Abrir mi sala",
    linkUrl: roomUrl,
  });
  return { subject, html, text };
}

// Recibo de recarga — se dispara desde el webhook de Stripe justo después de
// acreditar el saldo, para que quede constancia de cada movimiento real.
export function walletRechargeEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  amountCents: number;
  newBalanceCents: number;
  /** El segundo exacto en que se acreditó. */
  at: number;
  /** Referencia del pago en Stripe (sesión de checkout); de ahí sale el folio. */
  reference: string;
}): Mail {
  const { appUrl, name, avatarUrl, amountCents, newBalanceCents, at, reference } = opts;
  const monederoUrl = `${appUrl}/app/monedero`;
  const horas = Math.floor(newBalanceCents / 2000);
  const folio = folioDe(reference);
  const subject = `✅ Agregaste ${fmtPesos(amountCents)} MXN a tu saldo · ${folio}`;
  const html = renderShell({
    appUrl,
    preheader: `Tu recarga de ${fmtPesos(amountCents)} MXN ya está disponible. Saldo total: ${fmtPesos(newBalanceCents)} MXN. Folio ${folio}.`,
    badgeText: "✅ Recarga exitosa",
    avatarUrl,
    avatarAlt: name,
    headline: `Agregaste ${fmtPesos(amountCents)} a tu saldo`,
    bodyHtml: `Tu recarga ya está disponible y lista para usarse en cualquier sala.`,
    stats: [
      { value: fmtPesos(amountCents), label: "recargaste (MXN)", green: true },
      { value: fmtPesos(newBalanceCents), label: "saldo total" },
      { value: String(horas), label: plural(horas, "hora de sala a $20", "horas de sala a $20") },
    ],
    details: [
      { label: "Folio", value: folio, strong: true },
      { label: "Fecha y hora exacta", value: fmtMomentoCDMX(at) },
      { label: "Referencia de pago (Stripe)", value: reference },
      { label: "Moneda", value: "Pesos mexicanos (MXN)" },
    ],
    ctaLabel: "Ver mi monedero",
    linkUrl: monederoUrl,
    fineprint: "Tu saldo sirve para entrar a salas y mandar dinero a creadores. Cada movimiento queda guardado para siempre en Transacciones.",
  });
  const text = renderText({
    headline: subject,
    lines: [`Tu recarga de ${fmtPesos(amountCents)} MXN ya está disponible.`],
    details: [
      { label: "Folio", value: folio },
      { label: "Fecha y hora exacta", value: fmtMomentoCDMX(at) },
      { label: "Referencia de pago (Stripe)", value: reference },
      { label: "Saldo total", value: `${fmtPesos(newBalanceCents)} MXN` },
      { label: "Equivale a", value: `${horas} hora(s) de sala a $20` },
    ],
    ctaLabel: "Ver mi monedero",
    linkUrl: monederoUrl,
  });
  return { subject, html, text };
}

// Resumen al terminar una transmisión — manual o por la limpieza automática.
export function streamSummaryEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  roomTitle: string;
  durationMinutes: number;
  earnedCents: number;
  peakViewers: number;
  hearts: number;
  /** Reliquias ganadas con esta transmisión (si las hubo). */
  newRelics?: { icon: string; name: string; how: string }[];
  /** "Residente · 14 h en vivo · 36 h para Titular" */
  rankLine?: string;
}): Mail {
  const { appUrl, name, avatarUrl, roomTitle, durationMinutes, earnedCents, peakViewers, hearts, newRelics = [], rankLine } = opts;
  const details: Detail[] = [];
  if (rankLine) details.push({ label: "Tu rango", value: rankLine, strong: true });
  for (const r of newRelics) details.push({ label: `${r.icon} Nueva reliquia`, value: `${r.name} — ${r.how}`, strong: true });
  const statsUrl = `${appUrl}/app/estadisticas`;
  const duration = durationMinutes < 1 ? "menos de 1 minuto" : `${durationMinutes} ${plural(durationMinutes, "minuto", "minutos")}`;
  const subject = `📊 Tu transmisión terminó — ${fmtPesos(earnedCents)} ganados`;
  const html = renderShell({
    appUrl,
    preheader: `${peakViewers} ${plural(peakViewers, "persona", "personas")} en el pico, ${fmtPesos(earnedCents)} ganados.`,
    badgeText: "📊 Resumen de tu transmisión",
    tone: earnedCents > 0 ? "gold" : "green",
    avatarUrl,
    avatarAlt: name,
    headline: earnedCents > 0 ? `Ganaste ${fmtPesos(earnedCents)} en esta transmisión` : "Tu transmisión terminó",
    bodyHtml: `Estuviste en vivo <strong>${duration}</strong> en <strong>${escapeHtml(roomTitle)}</strong>. Así te fue:`,
    stats: [
      { value: fmtPesos(earnedCents), label: "ganados", green: true },
      { value: String(peakViewers), label: plural(peakViewers, "persona en el pico", "personas en el pico") },
      { value: String(hearts), label: plural(hearts, "corazón", "corazones") },
    ],
    details: details.length ? details : undefined,
    ctaLabel: "Ver mis estadísticas",
    linkUrl: statsUrl,
    afterHtml: "Ahí está el detalle: quién entró, cuánto dejó cada quien y de qué campaña vinieron.",
    fineprint: "Lo ganado ya está en tu balance de creador, listo para retirar desde $10 MXN.",
  });
  const text = renderText({
    headline: subject,
    lines: [`Estuviste en vivo ${duration} en ${roomTitle}.`],
    details: [
      { label: "Ganaste", value: `${fmtPesos(earnedCents)} MXN` },
      { label: "Pico de personas", value: String(peakViewers) },
      { label: "Corazones", value: String(hearts) },
    ],
    ctaLabel: "Ver mis estadísticas",
    linkUrl: statsUrl,
  });
  return { subject, html, text };
}

// Retiro exitoso: el momento más importante de confianza de todo el producto.
export function payoutSentEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  amountCents: number;
  totalWithdrawnCents: number;
  transferId: string;
  isFirst: boolean;
  /** El segundo exacto en que salió la transferencia. */
  at: number;
}): Mail {
  const { appUrl, name, avatarUrl, amountCents, totalWithdrawnCents, transferId, isFirst, at } = opts;
  const folio = folioDe(transferId);
  const txUrl = `${appUrl}/app/transacciones`;
  const subject = isFirst ? `💸 ¡Tu primer retiro! ${fmtPesos(amountCents)} van a tu banco` : `💸 ${fmtPesos(amountCents)} van en camino a tu banco`;
  const html = renderShell({
    appUrl,
    preheader: `Transferencia de ${fmtPesos(amountCents)} enviada a tu cuenta vía Stripe.`,
    badgeText: isFirst ? "🏆 Primer retiro" : "💸 Retiro enviado",
    tone: "gold",
    avatarUrl,
    avatarAlt: name,
    headline: isFirst ? `¡Tu primer retiro ya va en camino!` : `${fmtPesos(amountCents)} van en camino a tu banco`,
    bodyHtml: isFirst
      ? `Esto es lo que querías comprobar: <strong>el dinero de verdad llega</strong>. La transferencia ya salió por Stripe a la cuenta que conectaste.`
      : `La transferencia ya salió por Stripe a la cuenta bancaria que conectaste.`,
    stats: [
      { value: fmtPesos(amountCents), label: "este retiro", green: true },
      { value: fmtPesos(totalWithdrawnCents), label: "retirado en total" },
    ],
    details: [
      { label: "Folio", value: folio, strong: true },
      { label: "Fecha y hora exacta", value: fmtMomentoCDMX(at) },
      { label: "Monto", value: `${fmtPesos(amountCents)} MXN` },
      { label: "Referencia de Stripe", value: transferId },
      { label: "Llega", value: "En los próximos días hábiles, según tu banco" },
    ],
    ctaLabel: "Ver mis transacciones",
    linkUrl: txUrl,
    fineprint: "Si en 3 días hábiles no lo ves reflejado, responde este correo con el folio y la referencia.",
  });
  const text = renderText({
    headline: subject,
    lines: ["La transferencia ya salió por Stripe a la cuenta bancaria que conectaste."],
    details: [
      { label: "Folio", value: folio },
      { label: "Fecha y hora exacta", value: fmtMomentoCDMX(at) },
      { label: "Monto", value: `${fmtPesos(amountCents)} MXN` },
      { label: "Retirado en total", value: `${fmtPesos(totalWithdrawnCents)} MXN` },
      { label: "Referencia de Stripe", value: transferId },
    ],
    ctaLabel: "Ver mis transacciones",
    linkUrl: txUrl,
  });
  return { subject, html, text };
}

export function payoutFailedEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  amountCents: number;
}): Mail {
  const { appUrl, name, avatarUrl, amountCents } = opts;
  const monederoUrl = `${appUrl}/app/monedero`;
  const subject = `⚠️ No pudimos completar tu retiro — tu saldo sigue intacto`;
  const html = renderShell({
    appUrl,
    preheader: `Tu retiro de ${fmtPesos(amountCents)} no se completó. Los ${fmtPesos(amountCents)} siguen en tu balance.`,
    badgeText: "⚠️ Retiro no completado",
    tone: "red",
    avatarUrl,
    avatarAlt: name,
    headline: "No pudimos completar tu retiro",
    bodyHtml: `Stripe no aceptó la transferencia en este momento. <strong>Tu dinero no se movió</strong>: los ${fmtPesos(amountCents)} regresaron a tu balance de creador tal cual estaban.`,
    details: [
      { label: "Monto", value: `${fmtPesos(amountCents)} MXN` },
      { label: "Tu balance", value: "Intacto — nada se perdió" },
    ],
    ctaLabel: "Intentar de nuevo",
    linkUrl: monederoUrl,
    afterHtml: "Suele ser algo temporal. Si vuelve a fallar, revisa en «Conectar cuenta bancaria» que a Stripe no le falte ningún dato tuyo.",
  });
  const text = renderText({
    headline: subject,
    lines: [`Stripe no aceptó la transferencia. Los ${fmtPesos(amountCents)} MXN regresaron a tu balance de creador.`],
    ctaLabel: "Intentar de nuevo",
    linkUrl: monederoUrl,
  });
  return { subject, html, text };
}

export function bankConnectedEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  creatorBalanceCents: number;
}): Mail {
  const { appUrl, name, avatarUrl, creatorBalanceCents } = opts;
  const monederoUrl = `${appUrl}/app/monedero`;
  const subject = `🏦 Tu cuenta bancaria quedó conectada`;
  const puedeRetirar = creatorBalanceCents >= 1000;
  const html = renderShell({
    appUrl,
    preheader: "Ya puedes retirar lo que ganes directo a tu banco, desde $10 MXN.",
    badgeText: "🏦 Banco conectado",
    avatarUrl,
    avatarAlt: name,
    headline: "Tu cuenta bancaria quedó conectada",
    bodyHtml: `Stripe verificó tu identidad y tu cuenta. De aquí en adelante <strong>todo lo que ganes lo puedes retirar directo a tu banco</strong>, desde $10 MXN, cuando tú quieras.`,
    stats: [{ value: fmtMXN(creatorBalanceCents), label: "disponible para retirar", green: puedeRetirar }],
    ctaLabel: puedeRetirar ? "Retirar ahora" : "Ir a mi monedero",
    linkUrl: monederoUrl,
    afterHtml: puedeRetirar
      ? "Haz el primer retiro aunque sea chico: así compruebas con tus propios ojos que el dinero llega."
      : "En cuanto tengas $10 o más en tu balance de creador, el botón de retirar se enciende.",
    fineprint: "Nunca vemos tus datos bancarios: viven en Stripe.",
  });
  const text = renderText({
    headline: subject,
    lines: ["Ya puedes retirar lo que ganes directo a tu banco, desde $10 MXN."],
    details: [{ label: "Disponible para retirar", value: `${fmtMXN(creatorBalanceCents)} MXN` }],
    ctaLabel: "Ir a mi monedero",
    linkUrl: monederoUrl,
  });
  return { subject, html, text };
}
