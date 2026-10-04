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

export async function sendEmail(
  apiKey: string,
  params: { to: string; subject: string; html: string; text: string; unsubscribeUrl?: string }
): Promise<boolean> {
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

function escapeHtml(input: string): string {
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

export function fmtFechaCDMX(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "long",
  });
}

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

interface Stat {
  value: string;
  label: string;
  green?: boolean;
}
interface Detail {
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
function renderShell(o: ShellOpts): string {
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
function renderText(o: {
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

type Mail = { subject: string; html: string; text: string };

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
      { label: "Tú te quedas con", value: "$10 de cada entrada + 90% de las propinas" },
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
      { label: "Tú te quedas con", value: "$10 de cada entrada + 90% de las propinas" },
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
}): Mail {
  const { appUrl, name, avatarUrl, amountCents, newBalanceCents } = opts;
  const monederoUrl = `${appUrl}/app/monedero`;
  const horas = Math.floor(newBalanceCents / 2000);
  const subject = `✅ Agregaste ${fmtMXN(amountCents)} a tu saldo`;
  const html = renderShell({
    appUrl,
    preheader: `Tu recarga de ${fmtMXN(amountCents)} ya está disponible. Saldo total: ${fmtMXN(newBalanceCents)}.`,
    badgeText: "✅ Recarga exitosa",
    avatarUrl,
    avatarAlt: name,
    headline: `Agregaste ${fmtMXN(amountCents)} a tu saldo`,
    bodyHtml: `Tu recarga ya está disponible y lista para usarse en cualquier sala.`,
    stats: [
      { value: fmtMXN(amountCents), label: "recargaste", green: true },
      { value: fmtMXN(newBalanceCents), label: "saldo total" },
      { value: String(horas), label: plural(horas, "hora de sala", "horas de sala") },
    ],
    ctaLabel: "Ver mi monedero",
    linkUrl: monederoUrl,
    fineprint: "Tu saldo sirve para entrar a salas y mandar dinero a creadores. Cada movimiento queda guardado para siempre en Transacciones.",
  });
  const text = renderText({
    headline: subject,
    lines: [`Tu recarga de ${fmtMXN(amountCents)} MXN ya está disponible.`],
    details: [
      { label: "Saldo total", value: `${fmtMXN(newBalanceCents)} MXN` },
      { label: "Equivale a", value: `${horas} hora(s) de sala` },
    ],
    ctaLabel: "Ver mi monedero",
    linkUrl: monederoUrl,
  });
  return { subject, html, text };
}

// Recibo para el espectador al pagar su hora: cuánto pagó, hasta qué hora
// vale, cuánto saldo le queda — como un boleto.
export function passReceiptEmail(opts: {
  appUrl: string;
  viewerName: string;
  creatorName: string;
  creatorAvatar: string | null;
  roomUrl: string;
  amountCents: number;
  expiresAt: number;
  remainingBalanceCents: number;
}): Mail {
  const { appUrl, creatorName, creatorAvatar, roomUrl, amountCents, expiresAt, remainingBalanceCents } = opts;
  const subject = `🎟️ Entraste a la sala de ${creatorName}`;
  const html = renderShell({
    appUrl,
    preheader: `Tu hora en la sala de ${creatorName} termina a las ${fmtHoraCDMX(expiresAt)}.`,
    badgeText: "🎟️ Tu entrada",
    avatarUrl: creatorAvatar,
    avatarAlt: creatorName,
    headline: `Entraste a la sala de ${creatorName}`,
    bodyHtml: `Este es tu recibo. Tu hora corre desde que cruzaste la puerta; si la sala sigue abierta cuando se acabe, puedes renovar con un toque.`,
    details: [
      { label: "Pagaste", value: `${fmtMXN(amountCents)} MXN`, strong: true },
      { label: "Tu hora termina", value: `${fmtHoraCDMX(expiresAt)} (hora CDMX)` },
      { label: "Saldo que te queda", value: `${fmtMXN(remainingBalanceCents)} MXN` },
      { label: "Grabación", value: "Ninguna — nada queda guardado" },
    ],
    ctaLabel: "Volver a la sala",
    linkUrl: roomUrl,
    fineprint: "La mitad de tu entrada va directo al creador en el segundo en que entraste. Si te gustó, puedes mandarle propina desde la sala.",
  });
  const text = renderText({
    headline: subject,
    lines: ["Este es tu recibo. Tu hora corre desde que cruzaste la puerta."],
    details: [
      { label: "Pagaste", value: `${fmtMXN(amountCents)} MXN` },
      { label: "Tu hora termina", value: `${fmtHoraCDMX(expiresAt)} (CDMX)` },
      { label: "Saldo que te queda", value: `${fmtMXN(remainingBalanceCents)} MXN` },
    ],
    ctaLabel: "Volver a la sala",
    linkUrl: roomUrl,
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
  const subject = `📊 Tu transmisión terminó — ${fmtMXN(earnedCents)} ganados`;
  const html = renderShell({
    appUrl,
    preheader: `${peakViewers} ${plural(peakViewers, "persona", "personas")} en el pico, ${fmtMXN(earnedCents)} ganados.`,
    badgeText: "📊 Resumen de tu transmisión",
    tone: earnedCents > 0 ? "gold" : "green",
    avatarUrl,
    avatarAlt: name,
    headline: earnedCents > 0 ? `Ganaste ${fmtMXN(earnedCents)} en esta transmisión` : "Tu transmisión terminó",
    bodyHtml: `Estuviste en vivo <strong>${duration}</strong> en <strong>${escapeHtml(roomTitle)}</strong>. Así te fue:`,
    stats: [
      { value: fmtMXN(earnedCents), label: "ganados", green: true },
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
      { label: "Ganaste", value: `${fmtMXN(earnedCents)} MXN` },
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
}): Mail {
  const { appUrl, name, avatarUrl, amountCents, totalWithdrawnCents, transferId, isFirst } = opts;
  const txUrl = `${appUrl}/app/transacciones`;
  const subject = isFirst ? `💸 ¡Tu primer retiro! ${fmtMXN(amountCents)} van a tu banco` : `💸 ${fmtMXN(amountCents)} van en camino a tu banco`;
  const html = renderShell({
    appUrl,
    preheader: `Transferencia de ${fmtMXN(amountCents)} enviada a tu cuenta vía Stripe.`,
    badgeText: isFirst ? "🏆 Primer retiro" : "💸 Retiro enviado",
    tone: "gold",
    avatarUrl,
    avatarAlt: name,
    headline: isFirst ? `¡Tu primer retiro ya va en camino!` : `${fmtMXN(amountCents)} van en camino a tu banco`,
    bodyHtml: isFirst
      ? `Esto es lo que querías comprobar: <strong>el dinero de verdad llega</strong>. La transferencia ya salió por Stripe a la cuenta que conectaste.`
      : `La transferencia ya salió por Stripe a la cuenta bancaria que conectaste.`,
    stats: [
      { value: fmtMXN(amountCents), label: "este retiro", green: true },
      { value: fmtMXN(totalWithdrawnCents), label: "retirado en total" },
    ],
    details: [
      { label: "Referencia", value: transferId },
      { label: "Llega", value: "En los próximos días hábiles, según tu banco" },
    ],
    ctaLabel: "Ver mis transacciones",
    linkUrl: txUrl,
    fineprint: "Si en 3 días hábiles no lo ves reflejado, escríbenos respondiendo este correo con la referencia.",
  });
  const text = renderText({
    headline: subject,
    lines: ["La transferencia ya salió por Stripe a la cuenta bancaria que conectaste."],
    details: [
      { label: "Monto", value: `${fmtMXN(amountCents)} MXN` },
      { label: "Retirado en total", value: `${fmtMXN(totalWithdrawnCents)} MXN` },
      { label: "Referencia", value: transferId },
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
    preheader: `Tu retiro de ${fmtMXN(amountCents)} no se completó. Los ${fmtMXN(amountCents)} siguen en tu balance.`,
    badgeText: "⚠️ Retiro no completado",
    tone: "red",
    avatarUrl,
    avatarAlt: name,
    headline: "No pudimos completar tu retiro",
    bodyHtml: `Stripe no aceptó la transferencia en este momento. <strong>Tu dinero no se movió</strong>: los ${fmtMXN(amountCents)} regresaron a tu balance de creador tal cual estaban.`,
    details: [
      { label: "Monto", value: `${fmtMXN(amountCents)} MXN` },
      { label: "Tu balance", value: "Intacto — nada se perdió" },
    ],
    ctaLabel: "Intentar de nuevo",
    linkUrl: monederoUrl,
    afterHtml: "Suele ser algo temporal. Si vuelve a fallar, revisa en «Conectar cuenta bancaria» que a Stripe no le falte ningún dato tuyo.",
  });
  const text = renderText({
    headline: subject,
    lines: [`Stripe no aceptó la transferencia. Los ${fmtMXN(amountCents)} MXN regresaron a tu balance de creador.`],
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
