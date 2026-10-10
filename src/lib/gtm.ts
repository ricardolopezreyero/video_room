// RLR · Go-to-market de Video Room (/gtm): plan interno del equipo.
// Aquí vive quién puede verlo, los números reales de hoy y la página. El
// checklist está en gtm-tareas.ts; la interacción, en public/gtm.js (que no
// lleva contenido: el contenido solo se le manda a quien tiene acceso).
import type { Context } from "hono";
import type { Env } from "../env";
import type { User } from "./db";
import { currentUser } from "./current-user";
import { ADMIN_EMAIL, escapeHtml } from "./email";
import { TAREAS } from "./gtm-tareas";

type Ctx = Context<{ Bindings: Env }>;

/** Quién administra (agrega o quita personas) y el equipo de base. Los demás se agregan desde la página. */
const ADMINS = new Set([ADMIN_EMAIL.toLowerCase(), "reyero.ricardo@gmail.com"]);
const EQUIPO_BASE = new Set([...ADMINS, "yudiel@superleads.mx", "victor@superleads.mx", "enrique@superleads.mx"]);

export interface AccesoGtm { user: User | null; ok: boolean; admin: boolean }
export async function accesoGtm(c: Ctx): Promise<AccesoGtm> {
  const user = await currentUser(c).catch(() => null);
  if (!user) return { user: null, ok: false, admin: false };
  const email = user.email.trim().toLowerCase();
  if (EQUIPO_BASE.has(email)) return { user, ok: true, admin: ADMINS.has(email) };
  const fila = await c.env.DB.prepare("SELECT 1 FROM gtm_equipo WHERE email = ?").bind(email).first();
  return { user, ok: !!fila, admin: false };
}

export async function estadoGtm(env: Env): Promise<{ hechas: Record<string, { por: string; nombre: string; at: number }>; equipo: { email: string; fijo: boolean }[] }> {
  const [t, e] = await Promise.all([
    env.DB.prepare("SELECT id, hecha_por, hecha_nombre, hecha_at FROM gtm_tareas").all<{ id: string; hecha_por: string; hecha_nombre: string; hecha_at: number }>(),
    env.DB.prepare("SELECT email FROM gtm_equipo ORDER BY at").all<{ email: string }>(),
  ]);
  const hechas: Record<string, { por: string; nombre: string; at: number }> = {};
  for (const r of t.results) hechas[r.id] = { por: r.hecha_por, nombre: r.hecha_nombre, at: r.hecha_at };
  // fijo = equipo de base (no se quita desde la página)
  return { hechas, equipo: [...EQUIPO_BASE].map((email) => ({ email, fijo: true })).concat(e.results.filter((x) => !EQUIPO_BASE.has(x.email)).map((x) => ({ email: x.email, fijo: false }))) };
}

const GANANCIAS = "('ganancia_entrada','propina_recibida','destacado_recibido','ganancia_membresia')";
/** Dónde vamos hoy, con datos reales: lo que el plan llama «puerta» es entradas + membresías. */
export async function numerosReales(env: Env) {
  const ahora = Math.floor(Date.now() / 1000), CDMX = 6 * 3600;
  const d = new Date((ahora - CDMX) * 1000);
  const inicioMes = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000) + CDMX, hace7 = ahora - 7 * 86400;
  const uno = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>().catch(() => null);
  const [pases, memb, envios, creadores, registros, salas, sesiones] = await Promise.all([
    uno<{ g: number; casa: number; n: number }>("SELECT COALESCE(SUM(amount_cents),0) g, COALESCE(SUM(amount_cents - creator_cents),0) casa, COUNT(*) n FROM passes WHERE purchased_at >= ? AND amount_cents > 0", inicioMes),
    uno<{ g: number; casa: number }>("SELECT COALESCE(SUM(price_cents),0) g, COALESCE(SUM(price_cents - creator_cents),0) casa FROM memberships WHERE created_at >= ?", inicioMes),
    uno<{ g: number }>("SELECT COALESCE(SUM(amount_cents),0) g FROM tips WHERE created_at >= ?", inicioMes),
    uno<{ n: number }>(`SELECT COUNT(DISTINCT user_id) n FROM ledger WHERE amount_cents > 0 AND type IN ${GANANCIAS} AND created_at >= ?`, hace7),
    uno<{ n: number }>("SELECT COUNT(*) n FROM users"),
    uno<{ n: number }>("SELECT COUNT(*) n FROM rooms"),
    uno<{ n: number }>("SELECT COUNT(*) n FROM sessions WHERE started_at >= ?", hace7),
  ]);
  return {
    puerta_mes_cents: (pases?.g ?? 0) + (memb?.g ?? 0),
    casa_mes_cents: (pases?.casa ?? 0) + (memb?.casa ?? 0),
    entradas_mes: pases?.n ?? 0,
    envios_mes_cents: envios?.g ?? 0,
    creadores_semana: creadores?.n ?? 0,
    registros: registros?.n ?? 0,
    salas: salas?.n ?? 0,
    sesiones_semana: sesiones?.n ?? 0,
  };
}

/* ── la página ─────────────────────────────────────────────────────────── */
const barra = (n: number) => `<span class="gtm-pts" aria-label="${n} de 5">${"●".repeat(n)}<i>${"●".repeat(5 - n)}</i></span>`;

const RESUMEN = `
<section class="gtm-sec gtm-tesis">
  <p class="gtm-ceja">La tesis</p>
  <h2>Video Room no compite con TikTok. Es su caja.</h2>
  <p class="gtm-grande">El en vivo gratis es el anuncio. <b>La sala es el negocio.</b></p>
  <p>Los creadores ya tienen público y ya transmiten. Lo que no tienen es una puerta de cobro que sea suya. No hay que crear audiencia ni comprarla: hay que poner una caja al final del en vivo que ya hacen todos los días.</p>
</section>

<section class="gtm-sec">
  <h3>Por qué puede volverse masivo con poco dinero</h3>
  <div class="gtm-tres">
    <article><b>1 · El público ya existe</b><p>Cada creador llega con su gente. Nosotros no pagamos por espectadores: los trae quien cobra.</p></article>
    <article><b>2 · Cada creador es un equipo de marketing</b><p>Para llenar su sala publica su link y su QR. Ya tiene 63 diseños con su nombre en Materiales. Cada sesión es un anuncio de Video Room que no pagamos.</p></article>
    <article><b>3 · Todo el que entra a ver ya tiene sala</b><p>El espectador de hoy es el creador de mañana. Ese circuito es el que lleva de 100 a 1,000 sin anuncios.</p></article>
  </div>
</section>

<section class="gtm-sec">
  <h3>La jugada: «el after»</h3>
  <ol class="gtm-pasos-lista">
    <li><b>Hace su en vivo gratis de siempre</b> en TikTok, Instagram, Facebook o YouTube.</li>
    <li><b>Al final dice:</b> «Los que quieran seguir, preguntar su caso o pedir una canción, me paso a mi sala privada. El link está en mi perfil. Nada se graba.»</li>
    <li><b>Entran 5, 10 o 30 personas pagando.</b> Lo que le mandan adentro le llega completo.</li>
    <li><b>Al día siguiente publica «gracias»</b> con su número. Ese video es nuestro mejor anuncio.</li>
  </ol>
  <p class="gtm-nota">No le pedimos dejar ninguna red ni cambiar de costumbre. Le agregamos veinte minutos que pagan.</p>
</section>

<section class="gtm-sec">
  <h3>A quién buscar primero</h3>
  <p>Cinco caminos evaluados, de 1 a 5 puntos.</p>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Camino</th><th>Rapidez al primer peso</th><th>Dinero por sesión</th><th>Repite</th><th>Fácil de encontrar</th><th>Por qué</th></tr></thead>
    <tbody>
      <tr><td><b>1 · Expertos que contestan casos</b><small>Pensiones, impuestos, migración, abogados, nutrición</small></td><td>${barra(4)}</td><td>${barra(5)}</td><td>${barra(4)}</td><td>${barra(4)}</td><td>Ya contestan gratis en vivo y venden la consulta aparte. «Nada se graba» aquí vale oro: la gente cuenta su caso.</td></tr>
      <tr><td><b>2 · Lecturas y guía</b><small>Tarot, astrología, numerología</small></td><td>${barra(5)}</td><td>${barra(4)}</td><td>${barra(5)}</td><td>${barra(5)}</td><td>Transmiten a diario y su público ya paga por pregunta. Mandar dinero con mensaje es justo su dinámica.</td></tr>
      <tr><td><b>3 · Músicos y shows íntimos</b><small>Cantautores, tríos, DJs, comediantes</small></td><td>${barra(3)}</td><td>${barra(3)}</td><td>${barra(3)}</td><td>${barra(5)}</td><td>Menos dinero por sesión, pero dan emoción, clips virales y los eventos que hacen ruido.</td></tr>
      <tr><td><b>4 · Clases de movimiento</b><small>Zumba, yoga, baile, ejercicio</small></td><td>${barra(3)}</td><td>${barra(3)}</td><td>${barra(5)}</td><td>${barra(4)}</td><td>Hoy cobran por transferencia y lista de WhatsApp. La membresía mensual les queda perfecta.</td></tr>
      <tr><td><b>5 · Maestros y tutores</b><small>Idiomas, regularización, instrumentos</small></td><td>${barra(2)}</td><td>${barra(3)}</td><td>${barra(4)}</td><td>${barra(3)}</td><td>Constantes y serios, pero lentos para arrancar. Entran solos cuando vean a los demás.</td></tr>
    </tbody>
  </table></div>
  <p><b>Qué hacer:</b> probar los tres primeros al mismo tiempo durante tres semanas, con diez creadores cada uno, y quedarse con el que dé más dinero por creador y más repetición. Mi apuesta: expertos para el dinero, lecturas para la velocidad y músicos para la fama.</p>
  <p class="gtm-alerta"><b>Lo que no:</b> contenido para adultos, apuestas ni diagnósticos médicos. No es un juicio: el procesador de pagos cierra la cuenta, y sin cobros no hay empresa.</p>
</section>

<section class="gtm-sec">
  <h3>Los cinco pasos</h3>
  <div class="gtm-fases">
    <article data-fase="1"><span>Paso 1 · una semana</span><b>Cimientos</b><p>Que nada truene cuando llegue gente: reglas, cobros, números y mensaje.</p><p class="gtm-meta"><i>Para pasar:</i> tablero funcionando, política publicada y 300 creadores en lista.</p><div class="gtm-avance"><div></div></div><small></small></article>
    <article data-fase="2"><span>Paso 2 · semanas 1 a 3</span><b>Los primeros 10, a mano</b><p>El fundador y sus conocidos. Diez creadores con una sesión cobrada y tres casos con número.</p><p class="gtm-meta"><i>Para pasar:</i> al menos seis de diez repiten.</p><div class="gtm-avance"><div></div></div><small></small></article>
    <article data-fase="3"><span>Paso 3 · semanas 3 a 10</span><b>Los primeros 100</b><p>Entra la persona intensa: 40 mensajes y 3 videos al día. Meta: $300,000 de puerta al mes.</p><p class="gtm-meta"><i>Para pasar:</i> una de cada cinco salas nuevas cobra en sus primeros 14 días.</p><div class="gtm-avance"><div></div></div><small></small></article>
    <article data-fase="4"><span>Paso 4 · meses 3 a 6</span><b>Los primeros 1,000</b><p>Palancas: agencias de TikTok LIVE, embajadores, referidos, eventos y prensa. Meta: $3,000,000 de puerta.</p><p class="gtm-meta"><i>Para pasar:</i> uno de cada tres creadores nuevos llega sin que lo busquemos.</p><div class="gtm-avance"><div></div></div><small></small></article>
    <article data-fase="5"><span>Paso 5 · meses 6 a 12</span><b>El millón</b><p>Cabezas de cartel, membresías y otros países. $5,000,000 de puerta al mes dejan $1,000,000 a la casa.</p><p class="gtm-meta"><i>Meta:</i> $1,000,000 al mes, sostenido tres meses.</p><div class="gtm-avance"><div></div></div><small></small></article>
  </div>
  <p class="gtm-nota">Los tiempos son una meta agresiva, no una promesa. Cada paso tiene una condición para pasar al siguiente: si no se cumple, se arregla antes de gastar más.</p>
</section>

<section class="gtm-sec">
  <h3>Los cinco motores</h3>
  <ul class="gtm-motores">
    <li><b>A mano.</b> Mensajes directos y montar la primera sesión de cada creador. Lleva a los primeros 100. No escala, y por eso enseña.</li>
    <li><b>El after y los diseños.</b> Cada sesión obliga al creador a publicar su link. Su anuncio es nuestro anuncio.</li>
    <li><b>De espectador a creador.</b> Al terminar una sala: «tú también tienes una». Es el motor que no cuesta.</li>
    <li><b>Palancas.</b> Una agencia de TikTok LIVE o el administrador de una comunidad trae cincuenta creadores con una sola conversación.</li>
    <li><b>Prueba pública.</b> Casos con número, el muro de «pagado a creadores», prensa y buscadores. Convierte al que duda.</li>
  </ul>
</section>

<section class="gtm-sec">
  <h3>Tres cosas que hay que resolver antes de crecer</h3>
  <div class="gtm-tres">
    <article class="aviso"><b>La comisión de la tarjeta</b><p>Con la tarifa pública, una recarga de $50 le cuesta a la casa cerca del 11 % y una de $200 cerca del 6 % (estimación por confirmar). Y lo que se manda adentro no deja comisión. Hay que empujar recargas grandes, transferencia y tienda, y que el dinero ganado circule adentro. Tareas 106, 107 y 351.</p></article>
    <article class="aviso"><b>Lo fiscal y lo legal</b><p>Confirmar con un fiscalista si hay que retener impuestos a los creadores, y con un abogado que el monedero esté bien armado. Antes del paso 3, no después. Tareas 103 y 104.</p></article>
    <article class="aviso"><b>Depender de las redes</b><p>Las redes limitan mandar gente afuera. Por eso la jugada es «link en mi perfil» y el QR en pantalla, y por eso cada creador debe construir su lista de «Avísame» dentro de su sala.</p></article>
  </div>
</section>

<section class="gtm-sec">
  <h3>Lo que cuesta arrancar</h3>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Concepto</th><th>Al mes</th><th>Nota</th></tr></thead>
    <tbody>
      <tr><td>Líder de creadores</td><td>$25,000 + bonos</td><td>Bono por creador que cobra y por lo que genera su generación.</td></tr>
      <tr><td>Editor de video corto</td><td>$11,000</td><td>Por pieza: 90 videos al mes.</td></tr>
      <tr><td>Anuncios de prueba</td><td>$8,000</td><td>Solo recordar a quien ya nos visitó y probar la garantía.</td></tr>
      <tr><td>Herramientas</td><td>$3,000</td><td>Edición y programación de publicaciones. El CRM ya existe.</td></tr>
      <tr><td>Garantía de primera sesión</td><td>$15,000 una vez</td><td>Tope total: 50 creadores a $300.</td></tr>
      <tr><td><b>Total</b></td><td><b>≈ $47,000 al mes</b></td><td>Más $15,000 una sola vez. Es una propuesta para discutir, no una cotización.</td></tr>
    </tbody>
  </table></div>
</section>

<section class="gtm-sec gtm-tesis">
  <p class="gtm-ceja">Una sola medida</p>
  <h2>Creadores que cobraron esta semana.</h2>
  <p>Si ese número sube, todo lo demás va bien. Si no sube, nada de lo demás importa. Es el primer número del tablero y el que se dice en voz alta cada lunes.</p>
</section>`;

const NUMEROS = `
<section class="gtm-sec">
  <p class="gtm-ceja">La cuenta</p>
  <h2>Qué significa un millón al mes</h2>
  <p>La casa gana en la puerta: entradas y membresías. Lo que se manda adentro llega completo al creador. Mueve los supuestos y la cuenta se rehace sola.</p>
  <div class="gtm-calc">
    <div class="gtm-calc-in" id="gtm-calc-in"></div>
    <div class="gtm-calc-out" id="gtm-calc-out"></div>
  </div>
  <p class="gtm-nota">El costo de tarjeta es una estimación con la tarifa pública (3.6 % más $3 y su impuesto por recarga). Hay que confirmarlo con el procesador: tarea 106.</p>
</section>

<section class="gtm-sec">
  <h3>La pirámide: quién pone los $5,000,000 de puerta</h3>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Nivel</th><th>Cuántos</th><th>Puerta al mes cada uno</th><th>Cómo se ve</th><th>Suma</th></tr></thead>
    <tbody>
      <tr><td><b>Cabezas de cartel</b></td><td>20</td><td>$50,000</td><td>8 sesiones de 100 personas a $60, o 100 miembros más sus sesiones</td><td>$1,000,000</td></tr>
      <tr><td><b>Profesionales</b></td><td>180</td><td>$10,000</td><td>12 sesiones de 14 personas a $60</td><td>$1,800,000</td></tr>
      <tr><td><b>Constantes</b></td><td>1,100</td><td>$2,000</td><td>4 sesiones de 10 personas a $50</td><td>$2,200,000</td></tr>
      <tr><td><b>Total</b></td><td><b>1,300</b></td><td></td><td></td><td><b>$5,000,000</b></td></tr>
    </tbody>
  </table></div>
  <p>Veinte creadores grandes ponen la quinta parte. Por eso el paso 4 tiene un programa solo para ellos.</p>
</section>

<section class="gtm-sec">
  <h3>De dónde salen las salas nuevas</h3>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Fuente</th><th>Paso 3, al mes</th><th>Paso 5, al mes</th><th>Supuesto</th></tr></thead>
    <tbody>
      <tr><td>Mensajes directos</td><td>26</td><td>130</td><td>880 mensajes por persona al mes; 3 de cada 100 crean sala. Cinco personas en el paso 5.</td></tr>
      <tr><td>Videos cortos</td><td>80</td><td>600</td><td>90 videos al mes. 2,000 vistas promedio al inicio y 15,000 después; 3 de cada 1,000 visitan; 15 de cada 100 crean sala.</td></tr>
      <tr><td>Espectadores que se vuelven creadores</td><td>15</td><td>900</td><td>3 de cada 100 espectadores del mes abren su propia sala.</td></tr>
      <tr><td>Agencias y embajadores</td><td>0</td><td>400</td><td>Diez agencias con 40 anfitriones activos cada una.</td></tr>
      <tr><td>Buscadores</td><td>5</td><td>300</td><td>70 páginas con seis meses de antigüedad.</td></tr>
      <tr><td><b>Total</b></td><td><b>≈ 125</b></td><td><b>≈ 2,300</b></td><td>De cada 100 salas, unas 9 terminan cobrando cada mes.</td></tr>
    </tbody>
  </table></div>
  <p class="gtm-nota">Son supuestos para ordenar el plan, no promesas. Se corrigen cada lunes con el dato real del tablero.</p>
</section>`;

const RITMO = `
<section class="gtm-sec">
  <p class="gtm-ceja">Cuánto hay que publicar</p>
  <h2>El ritmo, desde el paso 3</h2>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Cada día</th><th>Cantidad</th><th>Al mes</th><th>Quién</th></tr></thead>
    <tbody>
      <tr><td>Videos cortos, el mismo en TikTok, Reels y Shorts</td><td>3 videos</td><td>90 videos · 270 publicaciones</td><td>Ambas</td></tr>
      <tr><td>Historias</td><td>2</td><td>60</td><td>Ambas</td></tr>
      <tr><td>Publicación en Facebook</td><td>1</td><td>30</td><td>Ambas</td></tr>
      <tr><td>Publicación en X</td><td>1</td><td>30</td><td>Ambas</td></tr>
      <tr><td>Mensajes directos a creadores</td><td>40</td><td>880</td><td>Persona</td></tr>
      <tr><td>Seguimientos a las 48 horas y a los 7 días</td><td>15</td><td>330</td><td>Persona</td></tr>
      <tr><td>Comentarios útiles en en vivos de creadores</td><td>10</td><td>220</td><td>Persona</td></tr>
    </tbody>
  </table></div>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Cada semana</th><th>Cantidad</th><th>Al mes</th><th>Quién</th></tr></thead>
    <tbody>
      <tr><td>Salas de bienvenida, martes y jueves a las 7 pm</td><td>2</td><td>8</td><td>Persona</td></tr>
      <tr><td>Caso «¿cuánto ganó?»</td><td>1</td><td>4</td><td>Ambas</td></tr>
      <tr><td>Clip de «el after»</td><td>1</td><td>4</td><td>Ambas</td></tr>
      <tr><td>Video largo en YouTube</td><td>1</td><td>4</td><td>Ambas</td></tr>
      <tr><td>Boletín para creadores</td><td>1</td><td>4</td><td>Ambas</td></tr>
      <tr><td>Aportaciones en grupos de Facebook</td><td>3</td><td>12</td><td>Persona</td></tr>
      <tr><td>Lunes de estreno</td><td>1</td><td>4</td><td>Ambas</td></tr>
      <tr><td>Reunión de números, 30 minutos</td><td>1</td><td>4</td><td>Persona</td></tr>
    </tbody>
  </table></div>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Cada mes</th><th>Cantidad</th><th>Quién</th></tr></thead>
    <tbody>
      <tr><td>Evento faro, desde el paso 4</td><td>1</td><td>Persona</td></tr>
      <tr><td>Reto con premio</td><td>1</td><td>Ambas</td></tr>
      <tr><td>Diseños de temporada en Materiales</td><td>1 tanda</td><td>IA</td></tr>
      <tr><td>Calendario del mes siguiente, antes del día 25</td><td>1</td><td>Ambas</td></tr>
      <tr><td>Análisis de los 20 mejores creadores</td><td>1</td><td>IA</td></tr>
      <tr><td>Cierre de dinero</td><td>1</td><td>Persona</td></tr>
    </tbody>
  </table></div>
  <div class="gtm-tres">
    <article><b>≈ 400 publicaciones al mes</b><p>270 de video corto, 60 historias, 30 en Facebook, 30 en X y lo semanal.</p></article>
    <article><b>≈ 1,400 contactos uno a uno</b><p>880 mensajes, 330 seguimientos y 220 comentarios. De ahí salen unas 26 salas y 13 creadores que cobran.</p></article>
    <article><b>8 salas de bienvenida</b><p>Dentro de Video Room. Vendemos usando el producto.</p></article>
  </div>
</section>

<section class="gtm-sec">
  <h3>Un día de la persona intensa</h3>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <tbody>
      <tr><td><b>9:00</b></td><td>Números de ayer y lista del día. 15 minutos.</td></tr>
      <tr><td><b>9:15</b></td><td>Veinte mensajes directos.</td></tr>
      <tr><td><b>10:30</b></td><td>Dos o tres llamadas de montaje de primera sesión.</td></tr>
      <tr><td><b>12:00</b></td><td>Grabar los tres videos del día con los guiones ya escritos.</td></tr>
      <tr><td><b>14:00</b></td><td>Seguimientos y rescates.</td></tr>
      <tr><td><b>15:00</b></td><td>Veinte mensajes directos más.</td></tr>
      <tr><td><b>16:30</b></td><td>Comentarios útiles en en vivos de creadores objetivo.</td></tr>
      <tr><td><b>18:00</b></td><td>Acompañar primeras sesiones. Martes y jueves, sala de bienvenida a las 7 pm.</td></tr>
      <tr><td><b>21:00</b></td><td>Anotar en el CRM y revisar el aviso de números.</td></tr>
    </tbody>
  </table></div>
  <p class="gtm-nota">Los en vivos pasan de tarde y de noche. Quien tome este puesto trabaja en ese horario, no de 9 a 5.</p>
</section>`;

const EQUIPO = `
<section class="gtm-sec">
  <p class="gtm-ceja">Dirección</p>
  <h2>Quien dirige: cómo elegirlo</h2>
  <p>El perfil público está en <a href="/ceo" target="_blank" rel="noopener" style="color:var(--green)">video.capitaltorreon.com/ceo</a>. Está escrito como espejo y termina en una prueba. Esta es la guía privada para evaluar a quien conteste.</p>
  <div class="gtm-tabla-caja"><table class="gtm-tabla">
    <thead><tr><th>Rasgo</th><th>Qué preguntar</th><th>Buena señal</th><th>Bandera roja</th></tr></thead>
    <tbody>
      <tr><td><b>Ambición</b></td><td>¿Cuál es la meta más grande que te has puesto y qué pasó?</td><td>Un número grande y propio, con resultado aunque sea parcial.</td><td>Habla de la empresa donde estuvo, no de lo que movió.</td></tr>
      <tr><td><b>Método</b></td><td>Enséñame cómo llevas tu semana.</td><td>Abre un sistema real y lo explica en minutos.</td><td>«Lo traigo en la cabeza.»</td></tr>
      <tr><td><b>Números</b></td><td>Dame tres números de tu último proyecto, de memoria.</td><td>Exactos, con de cuánto a cuánto y en cuánto tiempo.</td><td>«Bastante», «mucho», «creció muy bien».</td></tr>
      <tr><td><b>Eficiencia</b></td><td>¿Qué lograste con menos dinero del que cualquiera hubiera pedido?</td><td>Cuenta el costo peso por peso.</td><td>Pide equipo o presupuesto antes de empezar.</td></tr>
      <tr><td><b>Rapidez</b></td><td>¿Qué harías mañana a las 9?</td><td>Una acción concreta. Y mandó la prueba en horas.</td><td>«Primero haría un diagnóstico de un mes.»</td></tr>
      <tr><td><b>Honradez</b></td><td>Cuéntame un error tuyo que costó dinero. ¿A quién le avisaste y cuándo?</td><td>Lo cuenta sin adornos, con cifra y con fecha.</td><td>No encuentra ninguno, o la culpa fue de otro.</td></tr>
      <tr><td><b>Lealtad</b></td><td>¿Cuánto duraste en tus últimos tres compromisos y por qué saliste?</td><td>Años, y salidas limpias.</td><td>Brincos cada pocos meses. Habla mal de todos.</td></tr>
      <tr><td><b>Calle</b></td><td>Véndeme la sala como si yo fuera una tarotista con 20 mil seguidores.</td><td>Pregunta antes de ofrecer y cierra con fecha.</td><td>Recita características.</td></tr>
      <tr><td><b>Raíces</b></td><td>¿Qué lograste que un grupo adoptara y siguiera usando sin ti?</td><td>Nombra a las personas clave y la costumbre que dejó.</td><td>Habla de alcance e impresiones.</td></tr>
    </tbody>
  </table></div>
  <h3>El proceso, en cinco pasos</h3>
  <ol class="gtm-pasos-lista">
    <li><b>La prueba escrita.</b> Es el filtro. Quien ya abrió su sala y cobró una sesión va primero. Quien tardó semanas en mandarla, no.</li>
    <li><b>Una llamada de 30 minutos.</b> Solo números: las nueve preguntas de la tabla.</li>
    <li><b>Una semana pagada.</b> Misma meta que para el líder de creadores, más un reporte: tres creadores cobrando y una hoja con lo que midió, lo que aprendió y lo que cambiaría.</li>
    <li><b>Tres referencias por teléfono.</b> Alguien que le confió dinero, alguien que trabajó para él y alguien a quien le quedó mal. La tercera es la que más dice.</li>
    <li><b>El acuerdo por escrito.</b> Base, bonos atados al marcador, participación que se gana con el tiempo y con los números, y qué pasa si alguna de las partes se va.</li>
  </ol>
  <p class="gtm-alerta"><b>Antes de mandar la liga:</b> el perfil dice «base sobria, bonos por resultado y una parte de lo que construyas». Es una propuesta de redacción. Confirma que eso quieres ofrecer.</p>
  <h3>Pruebas recibidas</h3>
  <div id="gtm-postulaciones"></div>
</section>

<section class="gtm-sec">
  <p class="gtm-ceja">A quién contratar después</p>
  <h2>Una persona primero. Luego dos más.</h2>
  <div class="gtm-roles">
    <article>
      <span>Contratación 1 · paso 3</span>
      <b>Líder de creadores</b>
      <p>La persona intensa. Consigue creadores y los lleva hasta su primer peso.</p>
      <ul>
        <li><i>Viene de:</i> una agencia de TikTok LIVE, manejar comunidades de streamers o vender por mensaje.</li>
        <li><i>Se nota porque:</i> vive en los en vivos, escribe sin pena a desconocidos, sale a cámara y contesta rápido.</li>
        <li><i>No es:</i> alguien de mercadotecnia de escritorio ni un diseñador.</li>
        <li><i>Su número:</i> creadores con primer peso por semana. Meta del primer mes: 13.</li>
        <li><i>Pago:</i> base más bono por creador que cobra, más un porcentaje de lo que genere su generación durante seis meses.</li>
        <li><i>Prueba pagada de siete días:</i> lograr que tres creadores cobren su primera sesión. Quien lo logra, se queda.</li>
      </ul>
      <p class="gtm-vacante"><b>Vacante lista para publicar:</b> «Buscamos a la persona que más sabe de en vivos en México. Tu trabajo: conseguir creadores y ayudarles a cobrar su primera sesión en Video Room. Horario de tarde y noche. Base más bonos por resultado. La prueba es de siete días y es pagada: si tres creadores cobran gracias a ti, el puesto es tuyo.»</p>
    </article>
    <article>
      <span>Contratación 2 · paso 3</span>
      <b>Editor de video corto</b>
      <p>Por pieza, no de planta. Tres videos al día con guion ya escrito.</p>
      <ul>
        <li><i>Se nota porque:</i> su portafolio tiene videos de menos de 45 segundos con buen gancho y subtítulos.</li>
        <li><i>Su número:</i> videos entregados y vistas promedio.</li>
        <li><i>Pago:</i> por video, con bono si uno pasa de 100 mil vistas.</li>
      </ul>
    </article>
    <article>
      <span>Contratación 3 · paso 4</span>
      <b>Alianzas</b>
      <p>Cierra agencias, comunidades y academias. Una conversación suya vale cincuenta creadores.</p>
      <ul>
        <li><i>Viene de:</i> ventas a empresas o desarrollo de socios.</li>
        <li><i>Su número:</i> creadores activos que llegaron por un aliado.</li>
        <li><i>Pago:</i> base más comisión por lo que generen sus aliados.</li>
      </ul>
    </article>
  </div>
</section>

<section class="gtm-sec">
  <h3>Qué hace cada quien</h3>
  <div class="gtm-tres">
    <article><b>El fundador · 5 horas a la semana</b><p>Los creadores grandes, la prensa, los aliados clave, la reunión de números y las decisiones de dinero. Y transmitir él mismo: no se vende lo que no se usa.</p></article>
    <article><b>La inteligencia artificial</b><p>Guiones, ganchos, mensajes, artículos, páginas, diseños de temporada, tableros y análisis. Y todo lo de producto: lo que en el checklist dice «IA» se pide aquí mismo y se construye.</p></article>
    <article><b>Embajadores por comisión</b><p>Creadores que ya cobran y traen a otros. Desde el paso 4. No son nómina: ganan si traen.</p></article>
  </div>
</section>

<section class="gtm-sec" id="gtm-equipo-acceso">
  <h3>Quién puede ver esta página</h3>
  <p>Solo las cuentas de esta lista. A quien contrates, agrégalo aquí con el correo con el que entra.</p>
  <div id="gtm-equipo-lista"></div>
</section>`;

export function paginaGtm(o: { user: User; admin: boolean; hechas: unknown; equipo: unknown; real: unknown; postulaciones?: unknown; v: string }): string {
  const datos = JSON.stringify({ yo: { email: o.user.email, nombre: o.user.name, admin: o.admin }, tareas: TAREAS, hechas: o.hechas, equipo: o.equipo, real: o.real, postulaciones: o.postulaciones || [] }).replace(/</g, "\\u003c");
  const v = `?v=${encodeURIComponent(o.v)}`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Go-to-market — Video Room</title>
<link rel="preload" href="/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css${v}"></head>
<body class="app-shell gtm-cuerpo">
<div class="gtm-hoja">
  <header class="gtm-cab">
    <div><p class="gtm-ceja">Video Room · plan interno del equipo</p><h1>Go-to-market</h1><p class="muted">De cero a $1,000,000 al mes: la estrategia, la cuenta y las ${TAREAS.length} tareas.</p></div>
    <a class="gtm-salir" href="/app/monedero" title="Volver al monedero" aria-label="Volver al monedero">✕</a>
  </header>
  <div class="gtm-hoy" id="gtm-hoy" aria-label="Dónde vamos hoy"></div>
  <nav class="gtm-tabs" id="gtm-tabs" role="tablist">
    <button type="button" data-tab="resumen" class="on">Resumen</button>
    <button type="button" data-tab="numeros">Números</button>
    <button type="button" data-tab="checklist">Checklist <i id="gtm-cuenta-tab"></i></button>
    <button type="button" data-tab="ritmo">Ritmo</button>
    <button type="button" data-tab="equipo">Equipo</button>
  </nav>
  <main>
    <div class="gtm-tab" id="tab-resumen">${RESUMEN}</div>
    <div class="gtm-tab" id="tab-numeros" hidden>${NUMEROS}</div>
    <div class="gtm-tab" id="tab-checklist" hidden>
      <section class="gtm-sec">
        <p class="gtm-ceja">Lo que hay que hacer</p>
        <h2>Checklist</h2>
        <p>Cada palomita se guarda sola y la ve todo el equipo. Las tareas con ritmo se palomean cuando la costumbre ya quedó instalada.</p>
        <div class="gtm-carga" id="gtm-carga"></div>
        <div class="gtm-filtros" id="gtm-filtros"></div>
        <div id="gtm-lista"></div>
      </section>
    </div>
    <div class="gtm-tab" id="tab-ritmo" hidden>${RITMO}</div>
    <div class="gtm-tab" id="tab-equipo" hidden>${EQUIPO}</div>
  </main>
  <p class="muted gtm-pie">Plan interno. Sesión de ${escapeHtml(o.user.name)} · ${escapeHtml(o.user.email)}</p>
</div>
<div class="app-toast" id="gtm-toast"></div>
<script>window.__GTM = ${datos};</script>
<script src="/gtm.js${v}" defer></script>
</body></html>`;
}

export function paginaGtmCerrada(o: { conSesion: boolean; email?: string; v: string }): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>Video Room</title>
<link rel="icon" href="/og-default.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css?v=${encodeURIComponent(o.v)}"></head>
<body class="app-shell">
  <div class="onboarding-wrap"><div class="onboarding-card">
    <div class="onboarding-emoji">🔒</div>
    <h2>Esta página es del equipo</h2>
    <p class="muted">${o.conSesion ? `La cuenta ${escapeHtml(o.email || "")} no está en la lista. Pídele acceso a Ricardo.` : "Entra con tu cuenta para verla."}</p>
    ${o.conSesion ? "" : `<div data-login-ct="ancho" data-texto="Entrar con Google" style="margin:16px 0"></div>`}
    <p><a href="/?ver=1" style="color:var(--green)">Ir a Video Room</a></p>
  </div></div>
  <script src="/puente-login.js"></script>
  <script src="https://login.capitaltorreon.com/login.js" defer></script>
</body></html>`;
}

export const esTareaGtm = (id: string) => TAREAS.some((t) => t[0] === id);
