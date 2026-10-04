// RLR
import type { Room } from "./db";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderRoomPage(opts: {
  room: Room;
  ownerAvatar: string | null;
  live: boolean;
  viewerCount: number;
  appUrl: string;
  status?: { rank: { code: string; name: string }; hours: number; relics: { code: string; name: string; icon: string }[] } | null;
  /** Lo que room.js pedía a /api al arrancar (estado, quién soy, oferta):
   *  va dentro del HTML para que la sala sea usable en cuanto se pinta. */
  inicio?: unknown;
  /** Versión desplegada: va como ?v= en scripts y estilos, para que un deploy
   *  nunca mezcle este HTML con un room.js viejo guardado en caché. */
  assetVersion?: string;
}): string {
  const { room, ownerAvatar, live, viewerCount, appUrl, status, inicio } = opts;
  const v = opts.assetVersion ? `?v=${encodeURIComponent(opts.assetVersion)}` : "";
  // "<" escapado: un título con "</script>" no puede romper la página.
  const inicioJson = inicio ? JSON.stringify(inicio).replace(/</g, "\\u003c") : null;
  // Estatus bajo el nombre: el rango (si ya pasó de "Nuevo") y hasta cinco
  // reliquias. Discreto a propósito — es una firma, no un marcador.
  const statusHtml = status && (status.rank.code !== "nuevo" || status.relics.length)
    ? `<div class="room-status">
        ${status.rank.code !== "nuevo" ? `<span class="status-pill" title="${String(status.hours)} horas en vivo">${escapeHtml(status.rank.name)} · ${String(status.hours)} h en vivo</span>` : ""}
        ${status.relics.slice(0, 5).map((r) => `<span class="relic" title="${escapeHtml(r.name)}">${r.icon}</span>`).join("")}
      </div>`
    : "";
  const safeTitle = escapeHtml(room.title);
  const safeAvatar = ownerAvatar ? escapeHtml(ownerAvatar) : null;
  const ogImage = safeAvatar ?? `${appUrl}/og-default.svg`;
  const title = live ? `🔴 ${safeTitle} — EN VIVO` : `${safeTitle} — abre pronto`;
  const price = `$${Math.round((room.price_cents || 2000) / 100).toLocaleString("es-MX")}`;
  const desc = live
    ? `${viewerCount} persona${viewerCount === 1 ? "" : "s"} adentro · Entra por ${price}/hora · Nada se graba`
    : `${safeTitle} todavía no transmite. Toca para que te avisemos por correo en cuanto abra.`;
  // Copy para buscadores/redes — distinta del "desc" de arriba (ese es el
  // texto de estado dentro de la propia sala). Aquí buscamos que quien la
  // encuentre en Google entienda de un vistazo que es la sala privada de esta
  // persona y que puede entrar, esté en vivo o no en este momento.
  const seoDesc = live
    ? `${safeTitle} está en vivo ahora mismo en su sala privada de Video Room. Entra por ${price} la hora — nada se graba.`
    : `Esta es la sala privada de ${safeTitle} en Video Room. Te avisamos por correo en cuanto empiece a transmitir — entra cuando quieras.`;
  const canonicalUrl = `${appUrl}/${encodeURIComponent(room.slug)}`;
  // El avatar es lo más grande que se pinta al abrir: va con prioridad alta y
  // su origen (normalmente Google) se preconecta desde el <head>.
  const avatarHtml = safeAvatar
    ? `<img src="${safeAvatar}" alt="${safeTitle}" class="room-avatar" fetchpriority="high" decoding="async">`
    : "";
  let avatarPreconnect = "";
  try {
    if (ownerAvatar) {
      const origin = new URL(ownerAvatar).origin;
      if (origin !== appUrl) avatarPreconnect = `\n<link rel="preconnect" href="${escapeHtml(origin)}">`;
    }
  } catch {}

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${seoDesc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${seoDesc}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${seoDesc}">
<meta name="twitter:image" content="${ogImage}">
<link rel="preload" href="/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>${avatarPreconnect}
<link rel="icon" href="/og-default.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css${v}">
<script src="/veloz.js${v}"></script>
</head>
<body data-slug="${room.slug}" data-live="${live}">
  <div id="app" class="room-app">
    <video id="player" playsinline autoplay muted></video>
    <div id="overlay" class="overlay">
      ${avatarHtml}
      <h1>${live ? `🔴 ${safeTitle} está EN VIVO` : `${safeTitle} — abre pronto`}</h1>
      ${statusHtml}
      <p id="sub">${desc}</p>
      <div id="connect-spinner" class="connect-spinner" style="display:none"><span></span><span></span><span></span></div>
      <button id="btn-enter" class="btn-primary" style="display:${live ? "block" : "none"}">Entrar · ${price} la hora</button>
      <button id="btn-membership" class="btn-ghost" style="display:none"></button>
      <button id="btn-notify" class="btn-ghost" style="display:${live ? "none" : "block"}">🔔 Avísame cuando abra</button>
      <button id="btn-start" class="btn-primary" style="display:none">🔴 Transmitir en esta sala</button>
      <p class="fineprint">${live ? "Ingresas con Google en un tap. Tu hora empieza cuando cruzas la puerta." : "Te llega un correo y una notificación en el momento en que entre en vivo."}</p>
    </div>
    <div id="chat-panel" class="chat-panel" style="display:none">
      <div class="chat-panel-header">
        <canvas id="chat-wave" width="360" height="32" title="Audio en vivo"></canvas>
        <input id="dim-slider" type="range" min="30" max="100" value="100" title="Atenuar el video">
      </div>
      <!-- Meta de propinas de la transmisión: todos ven la barra llenarse. -->
      <div id="goal-bar" class="goal-bar" style="display:none">
        <div class="goal-track"><div id="goal-fill"></div></div>
        <span id="goal-text"></span>
      </div>
      <div id="pinned-msg" class="pinned-msg" style="display:none">
        <span class="pin-icon" aria-hidden="true">📌</span>
        <img id="pinned-avatar" class="pinned-avatar" style="display:none">
        <span id="pinned-text"></span>
        <button id="btn-unpin" style="display:none" title="Quitar">✕</button>
      </div>
      <div id="chat-feed" class="chat-feed"></div>
      <div class="chat-input-row">
        <input id="chat-input" maxlength="240" placeholder="Escribe un comentario…">
        <button id="btn-chat-send" title="Enviar">➤</button>
      </div>
      <p class="chat-privacy-note">🔒 Nada se graba — se borra al cerrar la sala.</p>
    </div>
    <div id="viewer-presence" class="viewer-presence" style="display:none">🟢 <span id="presence-count">0</span> en la sala<span id="viewer-quality" class="stream-quality"></span></div>
    <!-- Cuando se corta el internet (el del creador o el propio), esto es lo
         que se ve: quién falta, cuánto llevamos esperando, y que el chat
         sigue vivo. Nunca una pantalla negra sin explicación. -->
    <div id="reconnect-banner" class="reconnect-banner" style="display:none">
      <div class="reconnect-dots"><span></span><span></span><span></span></div>
      <div class="reconnect-text" id="reconnect-text">Reconectando…</div>
      <div class="reconnect-sub" id="reconnect-sub"></div>
    </div>
    <!-- Dock de controles: pensado para el pulgar. Cada botón mide 52px con su
         etiqueta debajo (data-label la pinta el CSS, así room.js puede seguir
         cambiando el emoji con textContent sin borrar la etiqueta). -->
    <div id="controls" class="controls" style="display:none">
      <button id="btn-tip" class="ctrl-btn primary" data-label="Dinero" aria-label="Mandar dinero">💵</button>
      <button id="btn-hand" class="ctrl-btn" data-label="Mano" aria-label="Levantar la mano">🎤</button>
      <button id="btn-chat" class="ctrl-btn" style="display:none" data-label="Chat" aria-label="Comentarios">💬</button>
      <button id="btn-mic" class="ctrl-btn" style="display:none" data-label="Mic" aria-label="Silenciar micrófono">🎙️</button>
      <button id="btn-cam" class="ctrl-btn" style="display:none" data-label="Cámara" aria-label="Apagar cámara">📷</button>
      <button id="btn-flip-cam" class="ctrl-btn" style="display:none" data-label="Girar" aria-label="Cambiar cámara">🔄</button>
      <select id="cam-select" class="cam-select" style="display:none" aria-label="Cámara"></select>
      <select id="quality-select" class="cam-select" style="display:none" aria-label="Calidad de video">
        <option value="auto">Auto · máxima</option>
        <option value="high">Alta</option>
        <option value="medium">Media</option>
        <option value="low">Baja</option>
        <option value="off">Solo audio</option>
      </select>
      <button id="btn-screen" class="ctrl-btn" style="display:none" data-label="Pantalla" aria-label="Compartir pantalla">🖥️</button>
    </div>
    <div id="studio-bar" class="studio-bar" style="display:none">
      <span class="live-dot" aria-hidden="true"></span>
      <span id="live-timer">0:00</span>
      <span id="viewer-count" title="Espectadores en este momento">👁 0</span>
      <span id="stream-quality" class="stream-quality" title="Calidad que estás mandando ahora mismo"></span>
      <span id="ticker-text" title="Ganado en esta transmisión">$0</span>
      <span id="conn-quality" class="conn-quality" title="Calidad de tu conexión"></span>
      <button id="btn-stop" class="btn-stop-secondary">Terminar</button>
    </div>
    <span id="audio-only-badge" class="audio-only-badge" style="display:none">🎧 Solo audio</span>
    <div id="toast" class="toast"></div>
    <!-- Menú de moderación por comentario (solo creador): un mismo popover
         compartido que room.js posiciona junto al comentario que tocaron. -->
    <div id="comment-actions" class="comment-actions" style="display:none">
      <button id="ca-like" data-action="like">❤️ Like</button>
      <button id="ca-mute" data-action="mute">🔇 Silenciar</button>
      <button id="ca-kick" data-action="kick">👢 Expulsar</button>
      <button id="ca-block" class="danger" data-action="block">🚫 Bloquear</button>
    </div>
    <!-- Espectadores conectados ahora mismo, ordenados de mayor a menor
         donador — exclusivo del creador (room.js lo abre al tocar el conteo). -->
    <div id="viewers-sheet" class="sheet" style="display:none">
      <div class="sheet-inner">
        <h3>👥 Conectados ahora</h3>
        <ul id="viewers-list" class="donor-list"></ul>
        <button id="viewers-close">Cerrar</button>
      </div>
    </div>
  </div>
  ${inicioJson ? `<script>window.__VR_INICIO = ${inicioJson};</script>` : ""}
  <script src="/motor-video.js${v}" defer></script>
  <script src="/room.js${v}" defer></script>
</body>
</html>`;
}
