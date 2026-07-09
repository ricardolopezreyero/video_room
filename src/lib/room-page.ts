import type { Room } from "./db";

export function renderRoomPage(opts: { room: Room; live: boolean; viewerCount: number; appUrl: string }): string {
  const { room, live, viewerCount, appUrl } = opts;
  const ogImage = `${appUrl}/og-default.svg`;
  const title = live ? `🔴 ${room.title} — EN VIVO` : `${room.title} — abre pronto`;
  const desc = live
    ? `${viewerCount} personas adentro · Entra por $20/hora · Nada se graba`
    : `Toca para que te avisemos cuando esté en vivo`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      <h1>${live ? `🔴 ${room.title} está EN VIVO` : `${room.title} — abre pronto`}</h1>
      <p id="sub">${desc}</p>
      <button id="btn-enter" class="btn-primary" style="display:${live ? "block" : "none"}">Entrar · $20 la hora</button>
      <button id="btn-notify" class="btn-ghost" style="display:${live ? "none" : "block"}">Avísame cuando abra</button>
      <button id="btn-start" class="btn-primary" style="display:none">🔴 Transmitir en esta sala</button>
      <p class="fineprint">Entras con Google en un tap. Tu hora empieza cuando cruzas la puerta.</p>
    </div>
    <div id="controls" class="controls" style="display:none">
      <button id="btn-tip">💵</button>
      <button id="btn-hand">🎤</button>
      <button id="btn-stop" style="display:none">Terminar</button>
    </div>
    <div id="ticker" class="ticker" style="display:none"></div>
    <div id="toast" class="toast"></div>
  </div>
  <script src="/room.js" defer></script>
</body>
</html>`;
}
