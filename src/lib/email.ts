// RLR
const RESEND_API = "https://api.resend.com/emails";
const FROM = "Video Room <VideoRoom@SuperLeads.mx>";

export async function sendEmail(
  apiKey: string,
  params: { to: string; subject: string; html: string; text: string }
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
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function liveNotificationEmail(opts: {
  creatorName: string;
  roomTitle: string;
  roomUrl: string;
}): { subject: string; html: string; text: string } {
  const { creatorName, roomTitle, roomUrl } = opts;
  const subject = `🔴 ${creatorName} ya está en vivo`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0; padding:0; background:#f4f7ff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7ff; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="background:#001240; padding:28px 32px;">
              <span style="color:#ffffff; font-size:18px; font-weight:800;">Video<span style="color:#56EF9F;">Room</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px;">
              <div style="display:inline-block; background:rgba(86,239,159,.12); color:#2BC878; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; padding:5px 12px; border-radius:20px; margin-bottom:16px;">
                🔴 En vivo ahora
              </div>
              <h1 style="margin:0 0 12px; font-size:24px; line-height:1.25; color:#001240; font-weight:800;">
                ${escapeHtml(creatorName)} ya está en vivo
              </h1>
              <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#4a5568;">
                Pediste que te avisáramos en cuanto <strong>${escapeHtml(roomTitle)}</strong> abriera su sala. Ya está transmitiendo — entra ahora, antes de que se acabe.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px; background:#56EF9F;">
                    <a href="${roomUrl}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:#001240; text-decoration:none;">
                      Entrar a la sala →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0; font-size:12px; color:#9aa5b8;">
                $20 pesos la hora · nada se graba · puedes salir cuando quieras.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px; background:#f8faff; border-top:1px solid #e0e8f8;">
              <p style="margin:0; font-size:11px; color:#9aa5b8; line-height:1.6;">
                Recibiste este correo porque pediste que te avisáramos cuando esta sala abriera en Video Room, un producto de SuperLeads.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = `${creatorName} ya está en vivo.\n\nPediste que te avisáramos cuando ${roomTitle} abriera su sala. Entra ahora: ${roomUrl}\n\n$20 pesos la hora · nada se graba.\n\n— Video Room (SuperLeads)`;

  return { subject, html, text };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
