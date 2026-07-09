// RLR
const RESEND_API = "https://api.resend.com/emails";
const FROM = "Video Room <VideoRoom@SuperLeads.mx>";

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
  preheader: string;
  badgeText: string;
  avatarUrl: string | null;
  creatorName: string;
  headline: string;
  bodyText: string;
  ctaLabel: string;
  roomUrl: string;
  fineprint: string;
  unsubscribeUrl: string;
}

// Estructura común de ambos correos: tabla de 600px, foto del creador, headline,
// botón de CTA y el URL de la sala mostrado en texto plano y grande — así se
// puede copiar/reenviar aunque el cliente de correo bloquee el link o la persona
// reenvíe el mensaje como texto.
function renderShell(opts: ShellOpts): string {
  const avatar = opts.avatarUrl
    ? `<img src="${escapeHtml(opts.avatarUrl)}" width="64" height="64" alt="${escapeHtml(opts.creatorName)}"
         style="border-radius:50%; border:3px solid #56EF9F; display:inline-block; vertical-align:middle;">`
    : "";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.headline)}</title>
</head>
<body style="margin:0; padding:0; background:#f4f7ff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7ff; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="background:#001240; padding:24px 32px;">
              <span style="color:#ffffff; font-size:18px; font-weight:800;">Video<span style="color:#56EF9F;">Room</span></span>
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
                    <h1 style="margin:0; font-size:23px; line-height:1.3; color:#001240; font-weight:800;">
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
                    <a href="${escapeHtml(opts.roomUrl)}" style="display:inline-block; padding:15px 30px; font-size:15px; font-weight:700; color:#001240; text-decoration:none;">
                      ${escapeHtml(opts.ctaLabel)} →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:#9aa5b8;">
                O comparte / copia este link
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7ff; border:1px solid #e0e8f8; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; font-size:15px; font-weight:700; color:#0039C8; word-break:break-all;">
                    ${escapeHtml(opts.roomUrl.replace(/^https?:\/\//, ""))}
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0; font-size:12px; color:#9aa5b8;">
                ${opts.fineprint}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px; background:#f8faff; border-top:1px solid #e0e8f8;">
              <p style="margin:0; font-size:11px; color:#9aa5b8; line-height:1.6;">
                Recibiste este correo porque pediste que te avisáramos sobre esta sala en Video Room, un producto de SuperLeads.
                <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#9aa5b8; text-decoration:underline;">Dejar de recibir avisos de esta sala</a>.
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
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const { creatorName, creatorAvatar, roomTitle, roomUrl, unsubscribeUrl } = opts;
  const subject = `🔴 ${creatorName} ya está en vivo`;

  const html = renderShell({
    preheader: `${creatorName} está transmitiendo ahora mismo — entra antes de que se acabe.`,
    badgeText: "🔴 En vivo ahora",
    avatarUrl: creatorAvatar,
    creatorName,
    headline: `${creatorName} ya está en vivo`,
    bodyText: `Pediste que te avisáramos en cuanto <strong>${escapeHtml(roomTitle)}</strong> abriera su sala. Ya está transmitiendo — entra ahora, antes de que se acabe.`,
    ctaLabel: "Entrar a la sala",
    roomUrl,
    fineprint: "$20 pesos la hora · nada se graba · puedes salir cuando quieras.",
    unsubscribeUrl,
  });

  const text = `${creatorName} ya está en vivo.\n\nPediste que te avisáramos cuando ${roomTitle} abriera su sala. Entra ahora: ${roomUrl}\n\n$20 pesos la hora · nada se graba.\n\nDejar de recibir avisos de esta sala: ${unsubscribeUrl}\n\n— Video Room (SuperLeads)`;

  return { subject, html, text };
}

export function startingSoonEmail(opts: {
  creatorName: string;
  creatorAvatar: string | null;
  roomTitle: string;
  roomUrl: string;
  minutes: number;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const { creatorName, creatorAvatar, roomTitle, roomUrl, minutes, unsubscribeUrl } = opts;
  const when = minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} hora${minutes / 60 === 1 ? "" : "s"}`
    : `${minutes} minutos`;
  const subject = `⏰ ${creatorName} empieza en ${when}`;

  const html = renderShell({
    preheader: `${creatorName} entra en vivo en ${when} — aparta el lugar antes de que se llene.`,
    badgeText: `⏰ Empieza en ${when}`,
    avatarUrl: creatorAvatar,
    creatorName,
    headline: `${creatorName} empieza en ${when}`,
    bodyText: `Pediste que te avisáramos sobre <strong>${escapeHtml(roomTitle)}</strong>. Está a punto de transmitir — aparta tu lugar y entra a tiempo.`,
    ctaLabel: "Ir a la sala",
    roomUrl,
    fineprint: "$20 pesos la hora · nada se graba · puedes salir cuando quieras.",
    unsubscribeUrl,
  });

  const text = `${creatorName} empieza en ${when}.\n\nPediste que te avisáramos sobre ${roomTitle}. Entra a tiempo: ${roomUrl}\n\n$20 pesos la hora · nada se graba.\n\nDejar de recibir avisos de esta sala: ${unsubscribeUrl}\n\n— Video Room (SuperLeads)`;

  return { subject, html, text };
}
