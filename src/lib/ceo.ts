// RLR · El perfil de quien va a dirigir Video Room (/ceo). Es una página
// pública pero sin listar en buscadores: se manda por liga. Está escrita como
// espejo (la persona correcta se reconoce) y termina en una prueba en vez de
// currículum. Las pruebas recibidas las ve solo el equipo, en /gtm → Equipo.
import type { Env } from "../env";
import { newId } from "./db";
import { ADMIN_EMAIL, escapeHtml, sendEmail } from "./email";

export interface Postulacion {
  id: string; created_at: number; nombre: string; correo: string; whatsapp: string; ciudad: string;
  sala: string; enlace: string; numero: string; siete_dias: string; correcto: string;
}

const txt = (v: unknown, max: number) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);

/** Valida y guarda una prueba. Devuelve el error (para decírselo a la persona) o la fila guardada. */
export async function guardarPostulacion(env: Env, cuerpo: Record<string, unknown>): Promise<{ error: string } | { ok: true; fila: Postulacion }> {
  if (txt(cuerpo.empresa, 50)) return { error: "no_procesado" }; // casilla trampa: la llenan los robots
  const f = {
    nombre: txt(cuerpo.nombre, 90), correo: txt(cuerpo.correo, 120).toLowerCase(), whatsapp: txt(cuerpo.whatsapp, 30), ciudad: txt(cuerpo.ciudad, 80),
    sala: txt(cuerpo.sala, 200), enlace: txt(cuerpo.enlace, 300), numero: txt(cuerpo.numero, 4000), siete_dias: txt(cuerpo.siete_dias, 6000), correcto: txt(cuerpo.correcto, 4000),
  };
  if (f.nombre.length < 3) return { error: "falta_nombre" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo)) return { error: "correo_invalido" };
  if (f.numero.length < 80) return { error: "numero_corto" };
  if (f.siete_dias.length < 120) return { error: "siete_dias_corto" };
  if (f.correcto.length < 80) return { error: "correcto_corto" };
  // Tope diario: una página pública no debe poder llenar la base.
  const hoy = await env.DB.prepare("SELECT COUNT(*) n FROM ceo_postulaciones WHERE created_at > unixepoch() - 86400").first<{ n: number }>();
  if ((hoy?.n ?? 0) >= 60) return { error: "demasiadas_hoy" };
  const repetida = await env.DB.prepare("SELECT 1 FROM ceo_postulaciones WHERE correo = ? AND created_at > unixepoch() - 86400").bind(f.correo).first();
  if (repetida) return { error: "ya_recibida" };
  const id = newId("ceo");
  await env.DB.prepare(
    "INSERT INTO ceo_postulaciones (id, nombre, correo, whatsapp, ciudad, sala, enlace, numero, siete_dias, correcto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, f.nombre, f.correo, f.whatsapp, f.ciudad, f.sala, f.enlace, f.numero, f.siete_dias, f.correcto).run();
  return { ok: true, fila: { id, created_at: Math.floor(Date.now() / 1000), ...f } };
}

export async function listarPostulaciones(env: Env): Promise<Postulacion[]> {
  const r = await env.DB.prepare("SELECT * FROM ceo_postulaciones ORDER BY created_at DESC LIMIT 100").all<Postulacion>().catch(() => ({ results: [] as Postulacion[] }));
  return r.results;
}

/** Aviso a la casa: llegó una prueba. */
export async function avisarPostulacion(env: Env, p: Postulacion): Promise<void> {
  const bloque = (t: string, v: string) => `<p style="margin:14px 0 4px;font:700 13px system-ui;color:#667">${escapeHtml(t)}</p><div style="white-space:pre-wrap;font:15px/1.5 system-ui;color:#111">${escapeHtml(v || "—")}</div>`;
  await sendEmail(env.RESEND_API_KEY, {
    to: ADMIN_EMAIL,
    subject: `🧭 Dirección de Video Room: prueba de ${p.nombre}`,
    html: `<div style="max-width:640px">${bloque("Quién", `${p.nombre} · ${p.ciudad}\n${p.correo} · ${p.whatsapp}`)}${bloque("Su sala", p.sala)}${bloque("Algo que construyó", p.enlace)}${bloque("Su número", p.numero)}${bloque("Sus primeros siete días", p.siete_dias)}${bloque("Lo correcto sobre lo conveniente", p.correcto)}<p style="margin-top:18px;font:13px system-ui"><a href="${escapeHtml(env.APP_URL)}/gtm#equipo">Ver todas las pruebas</a></p></div>`,
    text: `${p.nombre} · ${p.ciudad}\n${p.correo} · ${p.whatsapp}\nSala: ${p.sala}\nEnlace: ${p.enlace}\n\nSu número:\n${p.numero}\n\nSus primeros siete días:\n${p.siete_dias}\n\nLo correcto sobre lo conveniente:\n${p.correcto}`,
  });
}

/* ── la página ─────────────────────────────────────────────────────────── */
const RASGOS: [string, string, string, string][] = [
  ["Ambición", "Un millón al mes te parece el primer escalón.", "Lees la meta y ya estás pensando cómo se ve con diez. No te asusta el tamaño: te aburre lo chico. Y tu ambición es por lo construido, no por el reflector.", "Has perseguido una meta que otros llamaron exagerada, y tienes el número para probarlo."],
  ["Método", "Te dan más de 200 tareas y sonríes.", "No empiezas el día sin lista ni lo terminas sin cerrarla. Conviertes cualquier meta en pasos, fechas y responsables. Tu orden no es rigidez: es lo que te deja ir rápido sin romper nada.", "Tienes un sistema propio para llevar tu semana y lo puedes enseñar en cinco minutos."],
  ["Números", "Te sabes tus números de memoria.", "Cuántos entraron ayer, cuánto costó cada uno y cuántos volvieron. Si algo no se puede medir, lo vuelves medible antes de opinar. Distingues lo que crees de lo que sabes, y lo dices.", "Cuando cuentas un logro dices de cuánto a cuánto y en cuánto tiempo, sin que te lo pidan."],
  ["Eficiencia", "Gastas el dinero de la empresa como si fuera tuyo.", "Entre dos caminos eliges el que cuesta menos y enseña más. Antes de contratar, automatizas. Antes de pagar un anuncio, mandas cuarenta mensajes. Haces mucho con poco, y te gusta.", "Has logrado un resultado grande con un presupuesto que daba pena."],
  ["Rapidez", "Lo que otros agendan para el jueves, tú ya lo probaste hoy.", "Decides con el setenta por ciento de la información y corriges el mismo día. Contestas rápido, cierras rápido y aprendes rápido. Tu velocidad viene del método, no de la prisa.", "Entre que conociste este puesto y mandaste la prueba van a pasar horas, no semanas."],
  ["Honradez", "Das la mala noticia primero.", "Vas a tener en tus manos dinero que es de otras personas. Nunca has redondeado un número a tu favor. Si algo salió mal, lo dices antes de que te pregunten y llegas con la solución. Tu reporte y la realidad son la misma cosa.", "Quienes te confiaron dinero te lo volverían a confiar, y nos puedes dar su teléfono."],
  ["Lealtad", "Cuando te comprometes, te quedas.", "En el mes malo, en la junta difícil y cuando llegue una oferta mejor. Cuidas a quien confió en ti y hablas igual de él cuando no está. Tu palabra vale más que tu contrato.", "Has estado años en lo mismo, con la misma gente, y esa gente te sigue buscando."],
  ["Calle", "Has vendido uno a uno.", "Sabes escribirle a un desconocido, que te digan que no veinte veces y seguir con el veintiuno. No delegas lo que no has hecho con tus manos. Los primeros cien creadores los vas a conseguir tú.", "Puedes contar tu primera venta en frío con todo y detalles."],
  ["Raíces", "Te obsesiona la costumbre, no la fama.", "Prefieres mil personas que lo usan cada semana a un millón que lo vieron una vez. Sabes entrar a un gremio, a una academia o a una colonia, ganarte a quien todos escuchan y dejar algo funcionando cuando te vas.", "Has logrado que un grupo de gente adopte algo nuevo y lo siga usando sin ti."],
];

export function paginaCeo(v: string): string {
  const q = `?v=${encodeURIComponent(v)}`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Se busca: quien dirija Video Room</title>
<meta name="description" content="El producto está hecho. El plan está escrito. Falta la persona.">
<meta property="og:title" content="Se busca: quien dirija Video Room">
<meta property="og:description" content="El producto está hecho. El plan está escrito. Falta la persona. Si al leerlo piensas «por supuesto que soy yo», abajo está la prueba.">
<meta property="og:type" content="website"><meta property="og:image" content="https://video.capitaltorreon.com/og-default.svg">
<link rel="preload" href="/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css${q}"></head>
<body class="app-shell gtm-cuerpo">
<div class="gtm-hoja ceo-hoja">
  <header class="ceo-cab">
    <a class="logo" href="/?ver=1"><span>Video Room</span></a>
    <a class="btn-ghost small ceo-ir" href="#prueba">Ir a la prueba</a>
  </header>

  <section class="gtm-sec ceo-portada">
    <p class="gtm-ceja">Se busca</p>
    <h1>Buscamos a quien va a dirigir Video Room.</h1>
    <p class="gtm-grande">El producto está hecho. El plan está escrito. <b>Falta la persona.</b></p>
    <p>Si al terminar de leer piensas «por supuesto que soy yo», abajo está la prueba. No pedimos currículum.</p>
  </section>

  <section class="gtm-sec">
    <h3>De qué se trata</h3>
    <div class="gtm-tres">
      <article><b>Qué hace</b><p>Una sala de video en vivo con puerta de cobro. El creador comparte su link, la gente paga por entrar y nada se graba.</p></article>
      <article><b>Cómo gana</b><p>La casa se queda 1 de cada 5 pesos de la puerta. Lo que la gente le manda al creador adentro le llega completo.</p></article>
      <article><b>Dónde está</b><p>En producción y funcionando, con un plan de salida al mercado de más de 200 tareas y una meta: un millón de pesos al mes en doce meses.</p></article>
    </div>
  </section>

  <section class="gtm-sec ceo-servicio">
    <p class="gtm-ceja">Lo primero que debes entender</p>
    <h2>No es una marca. Es un servicio.</h2>
    <p>Una marca se recuerda. Un servicio se usa. Aquí no buscamos fama: buscamos costumbre. Que «pásate a mi sala» se diga con la misma naturalidad que «te mando la ubicación». Que el contador de la esquina, la maestra de zumba y el músico del viernes tengan su link en la puerta, en su tarjeta y en su perfil, y que cobrar por su tiempo en vivo les parezca lo normal.</p>
    <p>Eso no se logra con una campaña. Se siembra de persona en persona, de gremio en gremio y de colonia en colonia. Se riega cada semana y se cuida cuando nadie está viendo. Por eso buscamos a alguien que sepa echar raíces, no hacer ruido.</p>
  </section>

  <section class="gtm-sec">
    <p class="gtm-ceja">El espejo</p>
    <h2>Si esto eres tú, sigue leyendo.</h2>
    <div class="ceo-rasgos">
      ${RASGOS.map((r, i) => `<article><span>${String(i + 1).padStart(2, "0")}</span><div><small>${r[0]}</small><b>${r[1]}</b><p>${r[2]}</p><p class="ceo-nota"><i>Se nota en que</i> ${r[3].charAt(0).toLowerCase() + r[3].slice(1)}</p></div></article>`).join("")}
    </div>
  </section>

  <section class="gtm-sec">
    <p class="gtm-ceja">El trabajo</p>
    <h2>Lo que vas a lograr, con fecha.</h2>
    <div class="ceo-tiempo">
      <article><span>Tu primera semana</span><p>Abres tu sala y cobras tu primera sesión. Lees el plan completo. Nos dices tres cosas que cambiarías, cada una con su número.</p></article>
      <article><span>A 30 días</span><p>Los cimientos cerrados y diez creadores cobrando. Tres casos con nombre y cifra.</p></article>
      <article><span>A 90 días</span><p>Cien creadores cobrando y $300,000 de puerta al mes. Tu primera contratación ya rinde.</p></article>
      <article><span>A 6 meses</span><p>Mil creadores y $3,000,000 de puerta. Uno de cada tres llega sin que lo busques.</p></article>
      <article><span>A 12 meses</span><p>$5,000,000 de puerta al mes: un millón para la casa, sostenido tres meses.</p></article>
    </div>
    <p class="gtm-nota"><b>Tu marcador:</b> creadores que cobraron esta semana. Si ese número sube, todo lo demás va bien. Si no sube, nada de lo demás importa.</p>
  </section>

  <section class="gtm-sec">
    <h3>De dónde vienes, probablemente</h3>
    <ul class="gtm-motores">
      <li>Abriste una ciudad o un país para una aplicación de reparto, de transporte o de pagos.</li>
      <li>Dirigiste ventas de campo: afiliar negocios uno por uno, con meta semanal.</li>
      <li>Construiste una comunidad o una academia en línea que factura.</li>
      <li>Fundaste algo que pagó nómina, y sabes lo que es que no alcance.</li>
      <li>O nada de lo anterior, y aun así tienes pruebas de todo lo de arriba.</li>
    </ul>
    <p><b>No pedimos títulos. Pedimos pruebas.</b></p>
  </section>

  <section class="gtm-sec">
    <h3>Esto no es para ti si</h3>
    <ul class="ceo-no">
      <li>Te gusta más el logotipo que el servicio.</li>
      <li>Necesitas un equipo grande o un presupuesto de publicidad para arrancar.</li>
      <li>Vender te parece trabajo de otros.</li>
      <li>Buscas horario de oficina. Los en vivos son de tarde, de noche y en fin de semana.</li>
      <li>Te incomoda que todo se mida y que todos lo vean.</li>
      <li>Quieres ser la cara famosa. Aquí la cara es el creador.</li>
      <li>Ya estás pensando en tu siguiente proyecto.</li>
    </ul>
  </section>

  <section class="gtm-sec">
    <h3>Lo que tienes desde el primer día</h3>
    <div class="gtm-tres ceo-tienes">
      <article><b>El producto hecho</b><p>Cobros, recibos, chat en vivo, diseños para publicar, estadísticas y correos. No llegas a construir: llegas a crecer.</p></article>
      <article><b>El plan escrito</b><p>Cinco pasos, más de 200 tareas y la cuenta completa hacia el millón. Lo mejoras tú; no lo empiezas de cero.</p></article>
      <article><b>Una inteligencia artificial a tu lado</b><p>Lo que pidas de producto se construye en horas, no en trimestres. Tu límite es qué tan claro pides.</p></article>
      <article><b>Un fundador que abre puertas</b><p>Ya hizo crecer una empresa y está a un mensaje. Te respalda y no te estorba.</p></article>
      <article><b>Paga atada al marcador</b><p>Base sobria, bonos por resultado y una parte de lo que construyas. Los términos se platican con quien pase la prueba.</p></article>
      <article><b>La decisión en tus manos</b><p>Diriges. El plan se sigue mientras funcione y se cambia cuando tus números digan otra cosa.</p></article>
    </div>
  </section>

  <section class="gtm-sec ceo-prueba" id="prueba">
    <p class="gtm-ceja">La prueba</p>
    <h2>No queremos tu currículum. Queremos cuatro cosas.</h2>
    <form id="ceo-form" novalidate>
      <div class="ceo-paso">
        <span>Antes de escribir</span>
        <b>Abre tu sala y haz una sesión.</b>
        <p>Aunque sea con dos amigos. Toma diez minutos y es la mejor señal que nos puedes dar: quien de verdad es, ya lo hizo. <a href="/login" target="_blank" rel="noopener">Crear mi sala</a></p>
        <input name="sala" maxlength="200" placeholder="video.capitaltorreon.com/tu-sala" autocomplete="off" inputmode="url">
      </div>
      <div class="ceo-paso">
        <span>1 · Tu número</span>
        <b>El resultado medible del que estás más orgulloso.</b>
        <p>De cuánto a cuánto, en cuánto tiempo y qué hiciste tú.</p>
        <textarea name="numero" rows="5" maxlength="4000" required></textarea>
      </div>
      <div class="ceo-paso">
        <span>2 · Tus primeros siete días</span>
        <b>Día por día.</b>
        <p>Qué haces, qué mides y qué decides. Con lo que leíste aquí basta.</p>
        <textarea name="siete_dias" rows="8" maxlength="6000" required></textarea>
      </div>
      <div class="ceo-paso">
        <span>3 · Lo correcto sobre lo conveniente</span>
        <b>Una vez que elegiste lo correcto y te costó.</b>
        <p>Con dinero o con números de por medio. Qué pasó y cuánto te costó.</p>
        <textarea name="correcto" rows="5" maxlength="4000" required></textarea>
      </div>
      <div class="ceo-paso">
        <span>4 · Algo que construiste</span>
        <b>Una liga a algo tuyo que siga funcionando.</b>
        <input name="enlace" maxlength="300" placeholder="https://…" autocomplete="off" inputmode="url">
      </div>
      <div class="ceo-datos">
        <label><span>Nombre</span><input name="nombre" maxlength="90" autocomplete="name" required></label>
        <label><span>Correo</span><input name="correo" type="email" maxlength="120" autocomplete="email" required></label>
        <label><span>WhatsApp</span><input name="whatsapp" maxlength="30" autocomplete="tel" inputmode="tel"></label>
        <label><span>Ciudad</span><input name="ciudad" maxlength="80" autocomplete="address-level2"></label>
      </div>
      <input name="empresa" class="ceo-trampa" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="ceo-error" id="ceo-error" role="alert" hidden></p>
      <button class="btn-primary ceo-enviar" type="submit">Por supuesto que soy yo</button>
      <p class="muted ceo-priv">Tus respuestas solo las lee el equipo de Video Room. Lo que escribas se va guardando en este aparato hasta que lo mandes.</p>
    </form>
    <div class="ceo-listo" id="ceo-listo" hidden>
      <div class="onboarding-emoji">🧭</div>
      <h2>Recibido.</h2>
      <p>Si tu prueba dice lo que creemos, te escribimos nosotros. Mientras tanto: transmite.</p>
      <p><a class="btn-ghost" href="/app/monedero" style="display:inline-block;text-decoration:none;padding:10px 18px;border-radius:999px">Ir a mi sala</a></p>
    </div>
  </section>

  <p class="muted gtm-pie">Video Room · video.capitaltorreon.com</p>
</div>
<script>
(function () {
  var f = document.getElementById("ceo-form"), err = document.getElementById("ceo-error"), LL = "vr_ceo_borrador";
  var MENSAJES = { falta_nombre: "Falta tu nombre.", correo_invalido: "Ese correo no se ve bien.", numero_corto: "Tu número necesita más detalle: de cuánto a cuánto, en cuánto tiempo y qué hiciste tú.", siete_dias_corto: "Tus primeros siete días necesitan más detalle: día por día.", correcto_corto: "Cuéntanos con más detalle esa vez que elegiste lo correcto.", ya_recibida: "Ya recibimos tu prueba con ese correo. Si es la buena, te escribimos.", demasiadas_hoy: "Hoy llegaron muchas pruebas. Intenta mañana.", no_procesado: "No se pudo mandar. Intenta de nuevo." };
  try { var b = JSON.parse(localStorage.getItem(LL) || "{}"); Object.keys(b).forEach(function (k) { if (f.elements[k] && k !== "empresa") f.elements[k].value = b[k]; }); } catch (e) {}
  f.addEventListener("input", function () { try { var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; }); localStorage.setItem(LL, JSON.stringify(d)); } catch (e) {} });
  f.addEventListener("submit", async function (e) {
    e.preventDefault(); err.hidden = true;
    var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
    var boton = f.querySelector(".ceo-enviar"), texto = boton.textContent; boton.disabled = true; boton.textContent = "Mandando…";
    try {
      var r = await fetch("/api/ceo/postular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }), j = await r.json();
      if (!r.ok || j.error) { err.textContent = MENSAJES[j.error] || MENSAJES.no_procesado; err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else { try { localStorage.removeItem(LL); } catch (x) {} f.hidden = true; document.getElementById("ceo-listo").hidden = false; document.getElementById("prueba").scrollIntoView({ block: "start", behavior: "smooth" }); }
    } catch (x) { err.textContent = "No hay conexión. Tu texto sigue guardado aquí; intenta de nuevo."; err.hidden = false; }
    boton.disabled = false; boton.textContent = texto;
  });
})();
</script>
</body></html>`;
}
