// RLR · Tres cartas de bienvenida, firmadas por el fundador.
//  1. Al terminar el onboarding (el alta): por qué existe Video Room.
//  2. A las 24 horas exactas: dar.
//  3. A las 48 horas exactas: aprender a recibir.
// La 1 sale en el alta. La 2 y la 3 las programa el cron de cada media hora
// en Resend para el segundo exacto, así se respeta si la persona apagó
// «Tres cartas de bienvenida» en su monedero hasta media hora antes.
import type { Env } from "../env";
import { escapeHtml, fmtMXN, renderShell, renderText, sendEmail, type Funcion, type Mail } from "./email";
import { quiereDeFila } from "./correos";
import { PRICE_OPTIONS_CENTS, entrySplit } from "./pricing";

const DIA = 86400;
const VENTANA = 1800; // lo que tarda en volver a correr el cron
const FIRMA = ["Ricardo López Reyero", "Fundador de Video Room"];
const EJEMPLO = "Las capturas son de una sala de ejemplo con datos inventados.";

const primerNombre = (name: string) => (name || "").trim().split(/\s+/)[0] || "";
const parrafos = (ps: string[]) => ps.join("<br><br>");
const firmaHtml = `<br><br><strong>${FIRMA[0]}</strong><br>${FIRMA[1]}`;

interface Para {
  appUrl: string;
  name: string;
  avatarUrl: string | null;
  roomUrl: string;
}

const foto = (appUrl: string, nombre: string) => `${appUrl}/correos/carta-${nombre}.jpg`;

function armar(o: Para & { subject: string; preheader: string; numero: number; headline: string; parrafosTexto: string[]; parrafosHtml?: string[]; funcionesTitulo: string; funciones: Funcion[]; ctaLabel: string; linkUrl: string; despues?: string; letraChica?: string }): Mail {
  const funciones = o.funciones.map((f) => ({ ...f, img: foto(o.appUrl, f.img) }));
  const html = renderShell({
    appUrl: o.appUrl,
    preheader: o.preheader,
    badgeText: `Carta ${o.numero} de 3`,
    avatarUrl: null,
    avatarAlt: "",
    headline: o.headline,
    bodyHtml: parrafos(o.parrafosHtml ?? o.parrafosTexto.map(escapeHtml)) + firmaHtml,
    funcionesTitulo: o.funcionesTitulo,
    funciones,
    ctaLabel: o.ctaLabel,
    linkUrl: o.linkUrl,
    afterHtml: o.despues ? escapeHtml(o.despues) : undefined,
    fineprint: [o.letraChica, EJEMPLO].filter(Boolean).join(" "),
    ajustesUrl: `${o.appUrl}/app/monedero#correos`,
  });
  const text = renderText({
    headline: o.headline,
    lines: [...o.parrafosTexto.flatMap((p) => [p, ""]), ...FIRMA, "", o.funcionesTitulo.toUpperCase()],
    funciones,
    ctaLabel: o.ctaLabel,
    linkUrl: o.linkUrl,
    fineprint: [o.despues, o.letraChica].filter(Boolean).join("\n\n") || undefined,
  });
  return { subject: o.subject, html, text };
}

/** Carta 1 · al terminar el onboarding: tu vida mejora con tus herramientas. */
export function cartaUno(o: Para): Mail {
  const n = primerNombre(o.name);
  const precio = PRICE_OPTIONS_CENTS[0];
  const tope = PRICE_OPTIONS_CENTS[PRICE_OPTIONS_CENTS.length - 1];
  const link = o.roomUrl.replace(/^https?:\/\//, "");
  return armar({
    ...o,
    numero: 1,
    subject: n ? `${n}, tu sala ya existe` : "Tu sala ya existe",
    preheader: `Tu link es ${link}. Te cuento por qué hice Video Room.`,
    headline: "Tu vida avanza al ritmo de tus herramientas",
    parrafosTexto: [
      `${n ? `${n}, tu` : "Tu"} vida es tan abundante, tan rápida y tan plena como las herramientas que usas. Cuando mejoras tus herramientas, mejora tu vida.`,
      "Video Room es una herramienta nueva para eso: una fuente de ingresos por el tiempo que le dedicas a tu gente. Abres tu sala, la gente entra, convive contigo en vivo y te paga por esa hora. Es otra forma de ganar dinero, directa y rápida.",
      "Aquí te cuidamos. Nada se graba. Lo que te mandan adentro te llega completo. Cada movimiento trae su recibo con folio y hora.",
      "Te confieso algo: siempre soñé con hacer algo así. Hasta hoy pude crear una herramienta hecha solo para que quien crea cobre por estar en vivo de la forma más eficiente posible.",
      "La hicimos lo más en vivo que se puede, casi sin retraso, para que lo que dices llegue cuando lo dices. Tu gente siente que está contigo, no viendo una grabación. Por eso conecta. Y por eso tiene que ser algo muy tuyo: tu sala, tu gente, tu precio.",
    ],
    funcionesTitulo: "Tres cosas que ya puedes hacer",
    funciones: [
      { img: "1-sala", alt: "Tu sala en el monedero: link, transmitir, copiar link, código QR y materiales", titulo: "Tu link es tuyo", texto: `Tu sala vive en ${link}. Es numérica y no caduca: entre más antigua, más vale conservarla. Desde tu monedero transmites, copias el link, sacas tu código QR o le pones un nombre.` },
      { img: "1-precio", alt: "Cuánto cobras: precios por hora y lo que te quedas de cada uno", titulo: "Tú pones el precio", texto: `Elige cuánto vale tu hora, de ${fmtMXN(precio)} a ${fmtMXN(tope)}. De cada 5 pesos, 4 son tuyos al instante. Lo que te mandan adentro te llega completo.` },
      { img: "1-puerta", alt: "La puerta de una sala que todavía no transmite, con el botón Avísame cuando abra", titulo: "Lo que ve tu gente", texto: "Mientras no transmites, tu link muestra una puerta con tu nombre, tus logros y el botón «Avísame cuando abra». Quien lo toca recibe un correo y una notificación en cuanto entras en vivo." },
    ],
    ctaLabel: "Abrir mi sala",
    linkUrl: o.roomUrl,
    despues: "Mañana te escribo sobre dar. Pasado mañana, sobre recibir. Son solo tres cartas.",
    letraChica: `Cada persona paga ${fmtMXN(precio)} por hora o el precio que tú elijas. De cada ${fmtMXN(precio)} te quedas con ${fmtMXN(entrySplit(precio).creator)}.`,
  });
}

/** Carta 2 · a las 24 horas: venimos a dar. */
export function cartaDos(o: Para): Mail {
  const n = primerNombre(o.name);
  return armar({
    ...o,
    numero: 2,
    subject: "Venimos a dar",
    preheader: "Todo en tu sala está hecho para que des mejor.",
    headline: "Venimos a la vida a dar",
    parrafosTexto: [
      `${n ? `${n}, ayer` : "Ayer"} te conté por qué existe Video Room. Hoy quiero hablarte de lo más importante: venimos a la vida a dar.`,
      "Das cuando cuentas una historia, cuando enseñas lo que sabes, cuando haces reír a alguien que tuvo un mal día. Das tu tiempo, que es lo único que no se recupera.",
      "Dar no es regalar tu trabajo. Es ponerlo al servicio de alguien. Por eso todo en tu sala está hecho para que des mejor.",
      "Hoy piensa en una sola cosa que sabes y que a alguien le cambiaría el día. Esa es tu primera sala.",
    ],
    funcionesTitulo: "Cuatro herramientas para dar mejor",
    funciones: [
      { img: "2-materiales", alt: "Materiales para compartir: campaña de 15 días con diseños que llevan tu link y tu QR", titulo: "Invita con materiales listos", texto: "Más de cien diseños, muchos también en video con música, con tu nombre, tu link y tu QR. Vienen en campañas de 15 días: una publicación al día, en orden, para TikTok, Instagram, Facebook, YouTube y WhatsApp." },
      { img: "2-avisar", alt: "Avisar que ya casi empiezas: personas esperando y botón para avisar", titulo: "Avisa que ya casi empiezas", texto: "Toda la gente que tocó «Avísame» recibe tu aviso con un solo botón. Tú eliges cuántos minutos antes. Nadie se entera tarde." },
      { img: "2-minuto", alt: "Gráfica de en qué minuto se va la gente durante una transmisión", titulo: "Da mejor cada vez", texto: "Tus estadísticas te dicen en qué minuto empieza a irse la gente. Ahí cambias de ritmo: una pregunta, un anuncio, algo que mostrar." },
      { img: "2-membresia", alt: "Membresía mensual: precios y lo que te quedas", titulo: "Da un mes entero", texto: "Con la membresía, quien quiera estar contigo entra todas las veces que quiera durante 30 días, sin pagar cada hora. Es opcional y tú pones el precio." },
    ],
    ctaLabel: "Preparar mi invitación",
    linkUrl: `${o.appUrl}/app/materiales`,
    despues: "Mañana, la última carta: aprender a recibir.",
  });
}

/** Carta 3 · a las 48 horas: aprender a recibir. */
export function cartaTres(o: Para): Mail {
  const n = primerNombre(o.name);
  return armar({
    ...o,
    numero: 3,
    subject: "Aprende a recibir",
    preheader: "La última carta, y la que más me importa.",
    headline: "Ahora, aprende a recibir",
    parrafosTexto: [
      `${n ? `${n}, esta` : "Esta"} es la última carta de la serie, y es la que más me importa.`,
      "Recibir cuesta. Venimos cargando lo que nos pusieron encima la sociedad, nuestros papás, nuestros amigos, el entorno. Y casi siempre cargamos también el síndrome del impostor: esa voz que dice que no es para tanto, que alguien más lo haría mejor, que cobrar por lo tuyo es abusar.",
      "Vales más de lo que crees. Tu vida entera es una lucha contra esa voz, y vale la pena ganarla, porque no hay nada mejor que le haya pasado al mundo que el que hayas nacido tú y que hoy estés aquí, presente, leyendo estas palabras.",
      "Fíjate en lo que sientes ahora. Escribí estas líneas pensando en ti, y en este instante, mientras las lees, nos estamos encontrando. Eso mismo siente tu gente cuando cuentas una historia, cuando explicas algo con una analogía o cuando sueltas un chiste: siente que estaba destinada a escuchar lo que tenías que decir. Por eso se conectó. Por eso está ahí.",
      "Cuando alguien paga por tu hora o te manda dinero, te está diciendo que sintió lo que diste. Recibirlo es correcto. Es válido. Es la otra mitad de dar.",
      "Lo que haces es original, único e irrepetible. Cada momento es tuyo: puedes compartirlo o guardarlo para ti. Hoy tienes una herramienta más para decidir qué camino tomar, y el que tomes es el correcto.",
      "Gracias por llegar hasta aquí. Gracias por crear. Feliz creación.",
    ],
    funcionesTitulo: "Cómo se ve recibir en Video Room",
    funciones: [
      { img: "3-numeros", alt: "Tus números: ganado, entradas pagadas, propinas y transmisiones", titulo: "Mira lo que recibiste", texto: "Cuánto ganaste, cuántas entradas, cuántas propinas y cuál fue la mayor, cuánta gente nueva llegó. Por semana, mes o año, y en PDF. Y si hubo movimiento, cada viernes a las 3:33 pm te llega el corte de tu semana." },
      { img: "3-logros", alt: "Logros: primer peso, primer retiro, primera luz", titulo: "Cada primera vez se celebra", texto: "Tu primer peso, tu primer retiro, tu primera sala llena. Cada logro queda en tu sala, a la vista de tu gente." },
      { img: "3-ganado", alt: "Lo que has ganado, con los botones para retirar a tu banco y ver transacciones", titulo: "Recíbelo en tu banco", texto: "Retira desde $10 a tu banco, sin comisión nuestra, o gástalo adentro en otras salas. Cada movimiento queda guardado con su recibo. Nada se borra." },
    ],
    ctaLabel: "Abrir mi monedero",
    linkUrl: `${o.appUrl}/app/monedero`,
  });
}

const CARTAS = [cartaUno, cartaDos, cartaTres];

/** Cada media hora: programa en Resend la carta 2 o la 3 de quien le toca
 *  en la próxima media hora, para el segundo exacto (alta + 24 h o + 48 h).
 *  Si a alguien ya se le pasó la hora (cron caído), sale en ese momento. */
export async function programarCartas(env: Env, ahora = Math.floor(Date.now() / 1000)): Promise<{ programadas: number; apagadas: number }> {
  let programadas = 0, apagadas = 0;
  for (const paso of [1, 2] as const) {
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.created_at, u.correos, r.slug
         FROM users u LEFT JOIN rooms r ON r.owner_id = u.id
        WHERE u.cartas = ? AND u.created_at + ? <= ?
        GROUP BY u.id ORDER BY u.created_at LIMIT 200`
    ).bind(paso, paso * DIA, ahora + VENTANA).all<{ id: string; email: string; name: string; avatar_url: string | null; created_at: number; correos: string | null; slug: string | null }>();
    for (const u of results) {
      // Primero se marca: un correo de más es peor que uno de menos.
      const r = await env.DB.prepare("UPDATE users SET cartas = ? WHERE id = ? AND cartas = ?").bind(paso + 1, u.id, paso).run();
      if (!r.meta.changes) continue;
      if (!quiereDeFila(u.correos, "cartas")) { apagadas++; continue; }
      const cuando = u.created_at + paso * DIA;
      const mail = CARTAS[paso]({ appUrl: env.APP_URL, name: u.name, avatarUrl: u.avatar_url, roomUrl: u.slug ? `${env.APP_URL}/${u.slug}` : `${env.APP_URL}/app/monedero` });
      const ok = await sendEmail(env.RESEND_API_KEY, { to: u.email, ...mail, scheduledAt: cuando > ahora + 60 ? cuando : undefined });
      if (ok) programadas++;
    }
  }
  return { programadas, apagadas };
}
