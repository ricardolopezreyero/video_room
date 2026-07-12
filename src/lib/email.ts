// RLR
const RESEND_API = "https://api.resend.com/emails";
const FROM = "Video Room <hola@videoroom.live>";

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
        // List-Unsubscribe + el flag "One-Click" hacen que Gmail/Outlook muestren
        // su propio botón de "Cancelar suscripción" junto al remitente — mejora
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
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    // Algunos proveedores de correo transcodifican el HTML a quoted-printable y
    // no escapan bien un "=" seguido de dos caracteres hex (lo confunden con un
    // byte "=3D"-style), corrompiendo URLs con query params (?img=12, ?token=ab...).
    // &#61; se decodifica de vuelta a "=" en cualquier cliente, sin ese riesgo.
    .replace(/=/g, "&#61;");
}

interface ShellOpts {
  appUrl: string;
  preheader: string;
  badgeText: string;
  avatarUrl: string | null;
  creatorName: string;
  headline: string;
  bodyText: string;
  ctaLabel: string;
  linkUrl: string;
  fineprint: string;
  // Solo los correos de "avísame" (sala en vivo / empieza pronto) tienen algo
  // de qué darse de baja — los recibos transaccionales (recarga, resumen de
  // transmisión) no, así que este campo es opcional a propósito.
  unsubscribeUrl?: string;
}

// Estructura común a todos los correos: tabla de 600px, wordmark que lleva a
// videoroom.live, foto opcional, headline, botón de CTA y el link mostrado en
// texto plano y grande — así se puede copiar/reenviar aunque el cliente de
// correo bloquee el link o la persona reenvíe el mensaje como texto.
function renderShell(opts: ShellOpts): string {
  const avatar = opts.avatarUrl
    ? `<img src="${escapeHtml(opts.avatarUrl)}" width="64" height="64" alt="${escapeHtml(opts.creatorName)}"
         style="border-radius:50%; border:3px solid #56EF9F; display:inline-block; vertical-align:middle;">`
    : "";
  const footerText = opts.unsubscribeUrl
    ? `Recibiste este correo porque pediste que te avisáramos sobre esta sala en Video Room.
       <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#9aa5b8; text-decoration:underline;">Dejar de recibir avisos de esta sala</a>.`
    : `Recibiste este correo porque es un recibo de tu actividad en <a href="${escapeHtml(opts.appUrl)}" style="color:#9aa5b8; text-decoration:underline;">Video Room</a>.`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.headline)}</title>
</head>
<body style="margin:0; padding:0; background:#f7f8f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="background:#0D1117; padding:24px 32px;">
              <a href="${escapeHtml(opts.appUrl)}" style="text-decoration:none;">
                <span style="color:#ffffff; font-size:18px; font-weight:800;">Video<span style="color:#56EF9F;">Room</span></span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px;">
              <div style="display:inline-block; background:rgba(86,239,159,.12); color:#2BC878; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; padding:5px 12px; border-radius:20px; margin-bottom:20px;">
                ${escapeHtml(opts.badgeText)}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                <tr>
                  ${avatar ? `<td style="padding-right:14px;">${avatar}</td>` : ""}
                  <td>
                    <h1 style="margin:0; font-size:23px; line-height:1.3; color:#0D1117; font-weight:800;">
                      ${escapeHtml(opts.headline)}
                    </h1>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#4a5568;">
                ${opts.bodyText}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-radius:10px; background:#56EF9F;">
                    <a href="${escapeHtml(opts.linkUrl)}" style="display:inline-block; padding:15px 30px; font-size:15px; font-weight:700; color:#0D1117; text-decoration:none;">
                      ${escapeHtml(opts.ctaLabel)} →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:#9aa5b8;">
                O comparte / copia este link
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f9; border:1px solid #e4e4e7; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; font-size:15px; font-weight:700; color:#2BC878; word-break:break-all;">
                    ${escapeHtml(opts.linkUrl.replace(/^https?:\/\//, ""))}
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0; font-size:12px; color:#9aa5b8;">
                ${opts.fineprint}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px; background:#fafafa; border-top:1px solid #e4e4e7;">
              <p style="margin:0; font-size:11px; color:#9aa5b8; line-height:1.6;">
                ${footerText}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export function liveNotificationEmail(opts: {
  appUrl: string;
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const { appUrl, creatorName, creatorAvatar, roomTitle, roomUrl, unsubscribeUrl } = opts;
  const subject = `🔴 ${creatorName} ya está en vivo`;

  const html = renderShell({
    appUrl,
    preheader: `${creatorName} está transmitiendo ahora mismo — entra antes de que se acabe.`,
    badgeText: "🔴 En vivo ahora",
    avatarUrl: creatorAvatar,
    creatorName,
    headline: `${creatorName} ya está en vivo`,
    bodyText: `Pediste que te avisáramos en cuanto <strong>${escapeHtml(roomTitle)}</strong> abriera su sala. Ya está transmitiendo — entra ahora, antes de que se acabe.`,
    ctaLabel: "Entrar a la sala",
    linkUrl: roomUrl,
    fineprint: "$20 pesos la hora · nada se graba · puedes salir cuando quieras.",
    unsubscribeUrl,
  });

  const text = `${creatorName} ya está en vivo.\n\nPediste que te avisáramos cuando ${roomTitle} abriera su sala. Entra ahora: ${roomUrl}\n\n$20 pesos la hora · nada se graba.\n\nDejar de recibir avisos de esta sala: ${unsubscribeUrl}\n\n— Video Room`;

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
}): { subject: string; html: string; text: string } {
  const { appUrl, creatorName, creatorAvatar, roomTitle, roomUrl, minutes, unsubscribeUrl } = opts;
  const when = minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} hora${minutes / 60 === 1 ? "" : "s"}`
    : `${minutes} minutos`;
  const subject = `⏰ ${creatorName} empieza en ${when}`;

  const html = renderShell({
    appUrl,
    preheader: `${creatorName} entra en vivo en ${when} — aparta el lugar antes de que se llene.`,
    badgeText: `⏰ Empieza en ${when}`,
    avatarUrl: creatorAvatar,
    creatorName,
    headline: `${creatorName} empieza en ${when}`,
    bodyText: `Pediste que te avisáramos sobre <strong>${escapeHtml(roomTitle)}</strong>. Está a punto de transmitir — aparta tu lugar y entra a tiempo.`,
    ctaLabel: "Ir a la sala",
    linkUrl: roomUrl,
    fineprint: "$20 pesos la hora · nada se graba · puedes salir cuando quieras.",
    unsubscribeUrl,
  });

  const text = `${creatorName} empieza en ${when}.\n\nPediste que te avisáramos sobre ${roomTitle}. Entra a tiempo: ${roomUrl}\n\n$20 pesos la hora · nada se graba.\n\nDejar de recibir avisos de esta sala: ${unsubscribeUrl}\n\n— Video Room`;

  return { subject, html, text };
}

// Copia de confirmación para el creador — le llega siempre que dispara un
// aviso ("ya estoy en vivo" o "empiezo en X minutos"), tenga o no seguidores
// esperando, para que compruebe con sus propios ojos que el envío sí salió.
export function creatorNotifyConfirmationEmail(opts: {
  appUrl: string;
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  followerCount: number;
  kind: "live" | "starting_soon";
  minutes?: number;
}): { subject: string; html: string; text: string } {
  const { appUrl, creatorName, creatorAvatar, roomTitle, roomUrl, followerCount, kind, minutes } = opts;
  const when = kind === "starting_soon" && minutes
    ? (minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hora${minutes / 60 === 1 ? "" : "s"}` : `${minutes} minutos`)
    : null;
  const headline = kind === "live" ? "Ya avisamos que estás en vivo" : `Ya avisamos que empiezas en ${when}`;
  const subject = `✅ ${headline}`;
  const bodyText = followerCount > 0
    ? `Le mandamos este aviso a <strong>${followerCount} persona${followerCount === 1 ? "" : "s"}</strong> que pidió que le avisaras sobre <strong>${escapeHtml(roomTitle)}</strong>. Esta copia es para que confirmes que el envío sí salió.`
    : `Todavía nadie te ha pedido que le avises sobre <strong>${escapeHtml(roomTitle)}</strong>, así que este aviso no salió a nadie más — pero así se ve cuando sí tengas gente esperando. Esta copia es para que confirmes que el botón funciona.`;

  const html = renderShell({
    appUrl,
    preheader: headline,
    badgeText: kind === "live" ? "🔴 En vivo ahora" : `⏰ Empieza en ${when}`,
    avatarUrl: creatorAvatar,
    creatorName,
    headline,
    bodyText,
    ctaLabel: "Ver tu sala",
    linkUrl: roomUrl,
    fineprint: "Esta copia solo te llega a ti, para que confirmes que el aviso se mandó.",
  });

  const text = `${headline}.\n\n${followerCount > 0 ? `Se mandó a ${followerCount} persona(s).` : "Nadie más lo recibió todavía porque no tienes seguidores esperando."}\n\nVer tu sala: ${roomUrl}\n\n— Video Room`;

  return { subject, html, text };
}

// Recibo de recarga — se dispara desde el webhook de Stripe justo después de
// acreditar el saldo, para que quede constancia por correo de cada movimiento
// de dinero real, igual que un banco.
export function walletRechargeEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  amountCents: number;
  newBalanceCents: number;
}): { subject: string; html: string; text: string } {
  const { appUrl, name, avatarUrl, amountCents, newBalanceCents } = opts;
  const amount = Math.round(amountCents / 100);
  const balance = Math.round(newBalanceCents / 100);
  const monederoUrl = `${appUrl}/app/monedero`;
  const subject = `✅ Agregaste $${amount} a tu saldo`;

  const html = renderShell({
    appUrl,
    preheader: `Tu recarga de $${amount} ya está en tu saldo, lista para usarse.`,
    badgeText: "✅ Recarga exitosa",
    avatarUrl,
    creatorName: name,
    headline: `Agregaste $${amount} a tu saldo`,
    bodyText: `Tu recarga de <strong>$${amount} MXN</strong> ya está disponible. Tu saldo total ahora es <strong>$${balance} MXN</strong>.`,
    ctaLabel: "Ver mi monedero",
    linkUrl: monederoUrl,
    fineprint: "Tu saldo sirve para entrar a salas y mandar dinero a creadores.",
  });

  const text = `Agregaste $${amount} a tu saldo en Video Room.\n\nTu saldo total ahora es $${balance} MXN.\n\nVer tu monedero: ${monederoUrl}\n\n— Video Room`;

  return { subject, html, text };
}

// Resumen al terminar una transmisión — se dispara tanto al terminar a mano
// (botón "Terminar") como cuando la limpieza automática cierra una sala
// abandonada, para que el creador siempre sepa cómo le fue sin tener que
// entrar a revisar sus estadísticas por su cuenta.
export function streamSummaryEmail(opts: {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  roomTitle: string;
  durationMinutes: number;
  earnedCents: number;
  peakViewers: number;
  hearts: number;
}): { subject: string; html: string; text: string } {
  const { appUrl, name, avatarUrl, roomTitle, durationMinutes, earnedCents, peakViewers, hearts } = opts;
  const earned = Math.round(earnedCents / 100);
  const duration = durationMinutes < 1 ? "menos de 1 minuto" : `${durationMinutes} minuto${durationMinutes === 1 ? "" : "s"}`;
  const statsUrl = `${appUrl}/app/estadisticas`;
  const subject = `📊 Tu transmisión terminó — $${earned} ganados`;

  const html = renderShell({
    appUrl,
    preheader: `${peakViewers} persona${peakViewers === 1 ? "" : "s"} en el pico, $${earned} ganados. Ve el detalle completo.`,
    badgeText: "📊 Resumen de tu transmisión",
    avatarUrl,
    creatorName: name,
    headline: "Tu transmisión terminó",
    bodyText: `Estuviste en vivo ${duration} en <strong>${escapeHtml(roomTitle)}</strong>. ${peakViewers} persona${peakViewers === 1 ? "" : "s"} en el pico, ${hearts} corazón${hearts === 1 ? "" : "es"}, y ganaste <strong>$${earned} MXN</strong>.`,
    ctaLabel: "Ver mis estadísticas",
    linkUrl: statsUrl,
    fineprint: "El detalle completo — quién entró y cuánto dejó cada quien — está en tus estadísticas.",
  });

  const text = `Tu transmisión terminó.\n\nEstuviste en vivo ${duration} en ${roomTitle}. ${peakViewers} persona(s) en el pico, ${hearts} corazón(es), y ganaste $${earned} MXN.\n\nVer tus estadísticas: ${statsUrl}\n\n— Video Room`;

  return { subject, html, text };
}
