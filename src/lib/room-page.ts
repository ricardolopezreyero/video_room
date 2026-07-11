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
}): string {
  const { room, ownerAvatar, live, viewerCount, appUrl } = opts;
  const safeTitle = escapeHtml(room.title);
  const safeAvatar = ownerAvatar ? escapeHtml(ownerAvatar) : null;
  const ogImage = safeAvatar ?? `${appUrl}/og-default.svg`;
  const title = live ? `🔴 ${safeTitle} — EN VIVO` : `${safeTitle} — abre pronto`;
  const desc = live
    ? `${viewerCount} persona${viewerCount === 1 ? "" : "s"} adentro · Entra por $20/hora · Nada se graba`
    : `${safeTitle} todavía no transmite. Toca para que te avisemos por correo en cuanto abra.`;
  const avatarHtml = safeAvatar
    ? `<img src="${safeAvatar}" alt="${safeTitle}" class="room-avatar">`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${ogImage}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body data-slug="${room.slug}" data-live="${live}">
  <div id="app" class="room-app">
    <video id="player" playsinline autoplay muted></video>
    <div id="overlay" class="overlay">
      ${avatarHtml}
      <h1>${live ? `🔴 ${safeTitle} está EN VIVO` : `${safeTitle} — abre pronto`}</h1>
      <p id="sub">${desc}</p>
      <div id="connect-spinner" class="connect-spinner" style="display:none"><span></span><span></span><span></span></div>
      <button id="btn-enter" class="btn-primary" style="display:${live ? "block" : "none"}">Entrar · $20 la hora</button>
      <button id="btn-notify" class="btn-ghost" style="display:${live ? "none" : "block"}">🔔 Avísame cuando abra</button>
      <button id="btn-start" class="btn-primary" style="display:none">🔴 Transmitir en esta sala</button>
      <p class="fineprint">${live ? "Ingresas con Google en un tap. Tu hora empieza cuando cruzas la puerta." : "Te llega un correo y una notificación en el momento en que entre en vivo."}</p>
    </div>
    <div id="chat-panel" class="chat-panel" style="display:none">
      <div class="chat-panel-header">
        <canvas id="chat-wave" width="360" height="32" title="Audio en vivo"></canvas>
        <input id="dim-slider" type="range" min="30" max="100" value="100" title="Atenuar el video">
      </div>
      <div id="pinned-msg" class="pinned-msg" style="display:none">
        <span class="pin-icon" aria-hidden="true">📌</span>
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
    <div id="viewer-presence" class="viewer-presence" style="display:none">🟢 <span id="presence-count">0</span> en la sala</div>
    <div id="controls" class="controls" style="display:none">
      <button id="btn-tip">💵</button>
      <button id="btn-hand" class="ctrl-btn">🎤</button>
      <button id="btn-chat" class="ctrl-btn" style="display:none" title="Comentarios">💬</button>
      <button id="btn-mic" class="ctrl-btn" style="display:none" title="Silenciar micrófono">🎙️</button>
      <button id="btn-cam" class="ctrl-btn" style="display:none" title="Apagar cámara">📷</button>
      <button id="btn-flip-cam" class="ctrl-btn" style="display:none" title="Cambiar cámara">🔄</button>
      <select id="cam-select" class="cam-select" style="display:none"></select>
      <select id="quality-select" class="cam-select" style="display:none" title="Calidad de video">
        <option value="auto">Auto (recomendado)</option>
        <option value="high">Alta · 1080p</option>
        <option value="medium">Media · 480p</option>
        <option value="low">Baja · 180p</option>
        <option value="off">Apagado (solo audio)</option>
      </select>
      <button id="btn-screen" class="ctrl-btn" style="display:none" title="Compartir pantalla">🖥️</button>
    </div>
    <div id="studio-bar" class="studio-bar" style="display:none">
      <span class="live-dot" aria-hidden="true"></span>
      <span id="live-timer">0:00</span>
      <span id="viewer-count" title="Espectadores en este momento">👁 0</span>
      <span id="ticker-text">$0 esta sesión</span>
      <span id="conn-quality" class="conn-quality" title="Calidad de tu conexión"></span>
      <button id="btn-stop" class="btn-stop-secondary">Terminar</button>
    </div>
    <span id="audio-only-badge" class="audio-only-badge" style="display:none">🎧 Solo audio</span>
    <div id="toast" class="toast"></div>
  </div>
  <script src="/room.js" defer></script>
</body>
</html>`;
}
